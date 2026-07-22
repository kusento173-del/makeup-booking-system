import { Prisma } from '@makeup/database';
import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../database/database.service';
import {
  type NotificationChannelAdapter,
  NotificationProviderError,
  type NotificationSendInput,
} from './notification-channel.port';
import type { NotificationChannel } from './notification.types';

const STALE_PROCESSING_MS = 5 * 60_000;
const MAX_RETRY_DELAY_MS = 5 * 60_000;

interface ClaimedTask {
  readonly id: string;
}

export interface NotificationDeliveryResult {
  readonly status: 'EMPTY' | 'FAILED' | 'RETRY_WAIT' | 'SUCCEEDED';
  readonly taskId: string | null;
}

@Injectable()
export class NotificationDeliveryService {
  constructor(private readonly database: DatabaseService) {}

  async runOne(
    channel: NotificationChannel,
    adapter: NotificationChannelAdapter,
    now = new Date(),
  ): Promise<NotificationDeliveryResult> {
    await this.recoverOneStale(now);
    const taskId = await this.claim(channel, now);
    if (!taskId) return { status: 'EMPTY', taskId: null };

    const task = await this.database.read((client) =>
      client.notificationTask.findUnique({
        select: {
          attemptCount: true,
          businessKey: true,
          id: true,
          maxAttempts: true,
          payload: true,
          processingStartedAt: true,
          recipientUser: {
            select: {
              identities: {
                orderBy: { boundAt: 'desc' },
                select: {
                  externalSubject: true,
                  providerAppId: true,
                },
                take: 1,
                where: {
                  provider: this.identityProvider(channel),
                  status: 'ACTIVE',
                },
              },
            },
          },
          rowVersion: true,
          status: true,
          templateVersion: {
            select: {
              channel: true,
              providerTemplateKey: true,
              status: true,
            },
          },
        },
        where: { id: taskId },
      }),
    );
    if (!task || task.status !== 'PROCESSING' || !task.processingStartedAt) {
      throw new Error('Claimed notification task is unavailable');
    }
    const claimedTask = { ...task, processingStartedAt: task.processingStartedAt };

    const identity = claimedTask.recipientUser?.identities[0];
    const providerTemplateKey = claimedTask.templateVersion.providerTemplateKey;
    if (
      !identity ||
      !providerTemplateKey ||
      claimedTask.templateVersion.status !== 'ACTIVE' ||
      claimedTask.templateVersion.channel !== channel
    ) {
      await this.finishFailure(claimedTask, now, 'RECIPIENT_OR_TEMPLATE_UNAVAILABLE', false);
      return { status: 'FAILED', taskId };
    }

    const input: NotificationSendInput = {
      businessKey: claimedTask.businessKey,
      channel,
      payload: this.payload(claimedTask.payload),
      providerAppId: identity.providerAppId,
      providerTemplateKey,
      recipientExternalSubject: identity.externalSubject,
    };
    try {
      const result = await adapter.send(input);
      await this.finishSuccess(claimedTask, now, result.providerMessageId);
      return { status: 'SUCCEEDED', taskId };
    } catch (error) {
      const providerError =
        error instanceof NotificationProviderError
          ? error
          : new NotificationProviderError('NOTIFICATION_PROVIDER_UNAVAILABLE', true);
      const retryable =
        providerError.retryable && claimedTask.attemptCount < claimedTask.maxAttempts;
      await this.finishFailure(claimedTask, now, providerError.code, retryable);
      return { status: retryable ? 'RETRY_WAIT' : 'FAILED', taskId };
    }
  }

  private claim(channel: NotificationChannel, now: Date): Promise<string | null> {
    return this.database.transaction(async (transaction) => {
      const tasks = await transaction.$queryRaw<ClaimedTask[]>(Prisma.sql`
        SELECT task."id"
        FROM "notification_tasks" task
        JOIN "notification_template_versions" template
          ON template."id" = task."template_version_id"
        WHERE template."channel" = ${channel}
          AND template."status" = 'ACTIVE'
          AND (
            (task."status" = 'PENDING' AND task."scheduled_at" <= ${now})
            OR (task."status" = 'RETRY_WAIT' AND task."next_attempt_at" <= ${now})
          )
        ORDER BY COALESCE(task."next_attempt_at", task."scheduled_at"), task."created_at", task."id"
        FOR UPDATE OF task SKIP LOCKED
        LIMIT 1
      `);
      const task = tasks[0];
      if (!task) return null;
      const updated = await transaction.notificationTask.updateMany({
        data: {
          attemptCount: { increment: 1 },
          lastErrorCode: null,
          lastErrorSummary: null,
          nextAttemptAt: null,
          processingStartedAt: now,
          rowVersion: { increment: 1 },
          status: 'PROCESSING',
        },
        where: { id: task.id, status: { in: ['PENDING', 'RETRY_WAIT'] } },
      });
      return updated.count === 1 ? task.id : null;
    });
  }

  private recoverOneStale(now: Date): Promise<void> {
    return this.database.transaction(async (transaction) => {
      const tasks = await transaction.$queryRaw<
        { attemptCount: number; id: string; maxAttempts: number }[]
      >(Prisma.sql`
        SELECT "id", "attempt_count" AS "attemptCount", "max_attempts" AS "maxAttempts"
        FROM "notification_tasks"
        WHERE "status" = 'PROCESSING'
          AND "processing_started_at" <= ${new Date(now.getTime() - STALE_PROCESSING_MS)}
        ORDER BY "processing_started_at", "id"
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      `);
      const task = tasks[0];
      if (!task) return;
      const retryable = task.attemptCount < task.maxAttempts;
      await transaction.notificationTask.updateMany({
        data: {
          ...(retryable
            ? { nextAttemptAt: now, status: 'RETRY_WAIT' }
            : { failedAt: now, status: 'FAILED' }),
          lastErrorCode: 'WORKER_INTERRUPTED',
          lastErrorSummary: '上次投递未正常结束',
          rowVersion: { increment: 1 },
        },
        where: { id: task.id, status: 'PROCESSING' },
      });
    });
  }

  private finishSuccess(
    task: {
      readonly attemptCount: number;
      readonly id: string;
      readonly processingStartedAt: Date;
      readonly rowVersion: number;
    },
    now: Date,
    providerMessageId?: string,
  ): Promise<void> {
    return this.database.transaction(async (transaction) => {
      const updated = await transaction.notificationTask.updateMany({
        data: {
          ...(providerMessageId ? { providerMessageId } : {}),
          rowVersion: { increment: 1 },
          sentAt: now,
          status: 'SUCCEEDED',
        },
        where: { id: task.id, rowVersion: task.rowVersion, status: 'PROCESSING' },
      });
      if (updated.count !== 1) throw new Error('Notification completion conflicted');
      await transaction.notificationDeliveryAttempt.create({
        data: {
          attemptNumber: task.attemptCount,
          completedAt: now,
          notificationTaskId: task.id,
          outcome: 'SUCCEEDED',
          ...(providerMessageId ? { providerMessageId } : {}),
          startedAt: task.processingStartedAt,
        },
      });
    });
  }

  private finishFailure(
    task: {
      readonly attemptCount: number;
      readonly id: string;
      readonly maxAttempts: number;
      readonly processingStartedAt: Date;
      readonly rowVersion: number;
    },
    now: Date,
    code: string,
    retryable: boolean,
  ): Promise<void> {
    const summary = retryable ? '通知渠道暂不可用，系统将自动重试' : '通知无法发送';
    return this.database.transaction(async (transaction) => {
      const updated = await transaction.notificationTask.updateMany({
        data: {
          ...(retryable
            ? {
                nextAttemptAt: new Date(now.getTime() + this.retryDelay(task.attemptCount)),
                status: 'RETRY_WAIT',
              }
            : { failedAt: now, status: 'FAILED' }),
          lastErrorCode: code.slice(0, 64),
          lastErrorSummary: summary,
          rowVersion: { increment: 1 },
        },
        where: { id: task.id, rowVersion: task.rowVersion, status: 'PROCESSING' },
      });
      if (updated.count !== 1) throw new Error('Notification failure completion conflicted');
      await transaction.notificationDeliveryAttempt.create({
        data: {
          attemptNumber: task.attemptCount,
          completedAt: now,
          errorCode: code.slice(0, 64),
          errorSummary: summary,
          notificationTaskId: task.id,
          outcome: 'FAILED',
          startedAt: task.processingStartedAt,
        },
      });
    });
  }

  private identityProvider(channel: NotificationChannel): string {
    return channel === 'WECHAT_MINI_PROGRAM' ? 'WECHAT_MINIPROGRAM' : 'WECHAT_OFFICIAL_ACCOUNT';
  }

  private payload(value: Prisma.JsonValue): Readonly<Record<string, unknown>> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Notification task payload is invalid');
    }
    return value;
  }

  private retryDelay(attemptCount: number): number {
    return Math.min(MAX_RETRY_DELAY_MS, 30_000 * 2 ** Math.max(0, attemptCount - 1));
  }
}
