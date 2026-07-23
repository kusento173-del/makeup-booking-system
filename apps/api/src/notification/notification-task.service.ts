import type { Prisma } from '@makeup/database';
import { Injectable } from '@nestjs/common';

import { AuditCommandService } from '../audit/audit-command.service';
import {
  AuthorizationDeniedError,
  AuthorizationPolicyService,
} from '../auth/authorization-policy.service';
import type { VerifiedAuthorizationContext } from '../auth/authorization.types';
import { DatabaseService } from '../database/database.service';
import { acquireTransactionLock } from '../database/transaction-lock';
import type { MasterDataCommandContext } from '../master-data/master-data-command.types';
import { businessDateMinuteToInstant } from '../shift/business-date';
import {
  NotificationTaskNotFoundError,
  NotificationTaskRetryConflictError,
} from './notification-task.errors';
import type {
  NotificationTaskPage,
  NotificationTaskPageInput,
  NotificationTaskSummary,
  RetryNotificationTaskCommand,
} from './notification-task.types';

const MANUALLY_RETRYABLE_CODES = new Set([
  'NOTIFICATION_PROVIDER_UNAVAILABLE',
  'WECHAT_RESPONSE_INVALID',
  'WECHAT_SEND_RESPONSE_INVALID',
  'WECHAT_SEND_-1',
  'WECHAT_SEND_40001',
  'WECHAT_SEND_40014',
  'WECHAT_SEND_42001',
  'WECHAT_SEND_43108',
  'WECHAT_SEND_45009',
  'WECHAT_SEND_45011',
  'WECHAT_TOKEN_-1',
  'WECHAT_TOKEN_43108',
  'WECHAT_TOKEN_45009',
  'WECHAT_TOKEN_45011',
  'WECHAT_TRANSPORT_UNAVAILABLE',
  'WORKER_INTERRUPTED',
]);

export function isManuallyRetryableNotificationFailure(code: string | null): boolean {
  return code !== null && (MANUALLY_RETRYABLE_CODES.has(code) || /^WECHAT_HTTP_5\d\d$/.test(code));
}

@Injectable()
export class NotificationTaskService {
  constructor(
    private readonly audit: AuditCommandService,
    private readonly authorization: AuthorizationPolicyService,
    private readonly database: DatabaseService,
  ) {}

  list(
    context: VerifiedAuthorizationContext,
    input: NotificationTaskPageInput,
  ): Promise<NotificationTaskPage> {
    this.authorization.assertRole(context, ['CUSTOMER_SERVICE', 'ADMIN']);
    const filters: Prisma.NotificationTaskWhereInput[] = [];
    if (context.roleCode === 'CUSTOMER_SERVICE') {
      if (!context.siteId) throw new AuthorizationDeniedError();
      filters.push({ siteId: context.siteId });
    }
    if (input.status) filters.push({ status: input.status });
    if (input.recipientRoleCode) {
      filters.push({ recipientRoleCode: input.recipientRoleCode });
    }
    if (input.search) {
      filters.push({ recipientNameSnapshot: { contains: input.search, mode: 'insensitive' } });
    }
    if (input.date) {
      filters.push({
        scheduledAt: {
          gte: businessDateMinuteToInstant(input.date, 0),
          lt: businessDateMinuteToInstant(new Date(input.date.getTime() + 86_400_000), 0),
        },
      });
    }
    const where: Prisma.NotificationTaskWhereInput = filters.length === 0 ? {} : { AND: filters };
    return this.database.read(async (client) => {
      const [tasks, total] = await Promise.all([
        client.notificationTask.findMany({
          orderBy: [{ scheduledAt: 'desc' }, { id: 'desc' }],
          select: {
            attemptCount: true,
            cancelledAt: true,
            createdAt: true,
            failedAt: true,
            id: true,
            lastErrorCode: true,
            lastErrorSummary: true,
            maxAttempts: true,
            recipientNameSnapshot: true,
            recipientRoleCode: true,
            recipientUserId: true,
            retriedByTask: { select: { id: true } },
            retryOfTaskId: true,
            rowVersion: true,
            scheduledAt: true,
            sentAt: true,
            site: { select: { name: true } },
            siteId: true,
            status: true,
            templateVersion: { select: { templateCode: true } },
          },
          skip: (input.page - 1) * input.pageSize,
          take: input.pageSize,
          where,
        }),
        client.notificationTask.count({ where }),
      ]);
      return {
        items: tasks.map((task) => this.summary(task)),
        page: input.page,
        pageSize: input.pageSize,
        total,
      };
    });
  }

  retry(
    context: MasterDataCommandContext,
    taskId: string,
    command: RetryNotificationTaskCommand,
    now = new Date(),
  ): Promise<{ readonly id: string }> {
    this.authorization.assertRole(context, ['CUSTOMER_SERVICE', 'ADMIN']);
    return this.database.transaction(async (transaction) => {
      await acquireTransactionLock(transaction, `notification-retry:${taskId}`);
      const source = await transaction.notificationTask.findUnique({
        select: {
          appointmentId: true,
          businessKey: true,
          id: true,
          lastErrorCode: true,
          maxAttempts: true,
          payload: true,
          recipientNameSnapshot: true,
          recipientProfileId: true,
          recipientRoleCode: true,
          recipientUserId: true,
          retriedByTask: { select: { id: true } },
          rowVersion: true,
          siteId: true,
          sourceOutboxEventId: true,
          status: true,
          templateVersionId: true,
        },
        where: { id: taskId },
      });
      if (!source) throw new NotificationTaskNotFoundError();
      if (context.roleCode === 'CUSTOMER_SERVICE' && source.siteId !== context.siteId) {
        throw new AuthorizationDeniedError();
      }
      if (
        source.status !== 'FAILED' ||
        source.rowVersion !== command.expectedRowVersion ||
        source.retriedByTask ||
        !source.recipientUserId ||
        !isManuallyRetryableNotificationFailure(source.lastErrorCode)
      ) {
        throw new NotificationTaskRetryConflictError();
      }
      const retry = await transaction.notificationTask.create({
        data: {
          appointmentId: source.appointmentId,
          businessKey: `MANUAL_RETRY:${source.id}`,
          maxAttempts: source.maxAttempts,
          payload: this.payload(source.payload),
          recipientNameSnapshot: source.recipientNameSnapshot,
          recipientProfileId: source.recipientProfileId,
          recipientRoleCode: source.recipientRoleCode,
          recipientUserId: source.recipientUserId,
          retryOfTaskId: source.id,
          scheduledAt: now,
          siteId: source.siteId,
          sourceOutboxEventId: source.sourceOutboxEventId,
          templateVersionId: source.templateVersionId,
        },
        select: { id: true },
      });
      await this.audit.append(transaction, context, {
        action: 'NOTIFICATION_TASK_MANUAL_RETRY',
        afterData: { retryTaskId: retry.id },
        beforeData: {
          errorCode: source.lastErrorCode,
          sourceBusinessKey: source.businessKey,
          sourceTaskId: source.id,
        },
        objectId: retry.id,
        objectType: 'NOTIFICATION_TASK',
        reason: command.reason,
        siteId: source.siteId,
      });
      return retry;
    });
  }

  private payload(value: Prisma.JsonValue): Prisma.InputJsonObject {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new NotificationTaskRetryConflictError();
    }
    return value;
  }

  private summary(task: {
    readonly attemptCount: number;
    readonly cancelledAt: Date | null;
    readonly createdAt: Date;
    readonly failedAt: Date | null;
    readonly id: string;
    readonly lastErrorCode: string | null;
    readonly lastErrorSummary: string | null;
    readonly maxAttempts: number;
    readonly recipientNameSnapshot: string;
    readonly recipientRoleCode: string;
    readonly recipientUserId: string | null;
    readonly retriedByTask: { readonly id: string } | null;
    readonly retryOfTaskId: string | null;
    readonly rowVersion: number;
    readonly scheduledAt: Date;
    readonly sentAt: Date | null;
    readonly site: { readonly name: string };
    readonly siteId: string;
    readonly status: string;
    readonly templateVersion: { readonly templateCode: string };
  }): NotificationTaskSummary {
    return {
      attemptCount: task.attemptCount,
      canRetry:
        task.status === 'FAILED' &&
        !task.retriedByTask &&
        task.recipientUserId !== null &&
        isManuallyRetryableNotificationFailure(task.lastErrorCode),
      cancelledAt: task.cancelledAt?.toISOString() ?? null,
      createdAt: task.createdAt.toISOString(),
      failedAt: task.failedAt?.toISOString() ?? null,
      id: task.id,
      lastErrorCode: task.lastErrorCode,
      lastErrorSummary: task.lastErrorSummary,
      maxAttempts: task.maxAttempts,
      recipientName: task.recipientNameSnapshot,
      recipientRoleCode: task.recipientRoleCode as NotificationTaskSummary['recipientRoleCode'],
      retriedByTaskId: task.retriedByTask?.id ?? null,
      retryOfTaskId: task.retryOfTaskId,
      rowVersion: task.rowVersion,
      scheduledAt: task.scheduledAt.toISOString(),
      sentAt: task.sentAt?.toISOString() ?? null,
      siteId: task.siteId,
      siteName: task.site.name,
      status: task.status as NotificationTaskSummary['status'],
      templateCode: task.templateVersion.templateCode as NotificationTaskSummary['templateCode'],
    };
  }
}
