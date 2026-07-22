import type { Prisma } from '@makeup/database';
import { describe, expect, it, vi } from 'vitest';

import type { DatabaseService } from '../database/database.service';
import {
  type NotificationChannelAdapter,
  NotificationProviderError,
} from './notification-channel.port';
import { NotificationDeliveryService } from './notification-delivery.service';

const now = new Date('2026-07-22T12:00:00.000Z');
const task = {
  attemptCount: 1,
  businessKey: 'APPOINTMENT_CREATED:appointment-1:HOST:host-1',
  id: 'task-1',
  maxAttempts: 5,
  payload: { appointmentId: 'appointment-1', hostName: '小雨' },
  processingStartedAt: now,
  recipientUser: {
    identities: [
      {
        externalSubject: 'openid-sensitive',
        providerAppId: 'wx-app-1',
      },
    ],
  },
  rowVersion: 2,
  status: 'PROCESSING',
  templateVersion: {
    channel: 'WECHAT_MINI_PROGRAM',
    providerTemplateKey: 'template-1',
    status: 'ACTIVE',
    variableKeys: ['thing1=hostName'],
  },
};

function createService(options?: {
  readonly claimed?: boolean;
  readonly stale?: object | null;
  readonly task?: object | null;
}) {
  const queryRaw = vi
    .fn()
    .mockResolvedValueOnce(options?.stale ? [options.stale] : [])
    .mockResolvedValueOnce(options?.claimed === false ? [] : [{ id: 'task-1' }]);
  const updateMany = vi.fn().mockResolvedValue({ count: 1 });
  const transaction = {
    $queryRaw: queryRaw,
    notificationDeliveryAttempt: { create: vi.fn().mockResolvedValue({ id: 'attempt-1' }) },
    notificationTask: { updateMany },
  };
  const client = {
    notificationTask: {
      findUnique: vi.fn().mockResolvedValue(options?.task === undefined ? task : options.task),
    },
  };
  const database = {
    read: vi.fn((operation: (value: object) => unknown) => operation(client)),
    transaction: vi.fn((operation: (value: Prisma.TransactionClient) => unknown) =>
      operation(transaction as unknown as Prisma.TransactionClient),
    ),
  };
  return {
    client,
    service: new NotificationDeliveryService(database as unknown as DatabaseService),
    transaction,
  };
}

describe('NotificationDeliveryService', () => {
  it('aggregates a bounded delivery batch and stops on an empty queue', async () => {
    const { service } = createService();
    const runOne = vi
      .spyOn(service, 'runOne')
      .mockResolvedValueOnce({ status: 'SUCCEEDED', taskId: 'task-1' })
      .mockResolvedValueOnce({ status: 'RETRY_WAIT', taskId: 'task-2' })
      .mockResolvedValueOnce({ status: 'FAILED', taskId: 'task-3' })
      .mockResolvedValueOnce({ status: 'EMPTY', taskId: null });
    const adapter = { send: vi.fn() };

    await expect(service.runBatch('WECHAT_MINI_PROGRAM', adapter, 20, now)).resolves.toEqual({
      failedCount: 1,
      processedCount: 3,
      retryCount: 1,
      succeededCount: 1,
    });
    expect(runOne).toHaveBeenCalledTimes(4);
  });

  it('claims, sends and atomically records a successful immutable attempt', async () => {
    const { service, transaction } = createService();
    const send = vi.fn().mockResolvedValue({ providerMessageId: 'message-1' });
    const adapter: NotificationChannelAdapter = { send };

    await expect(service.runOne('WECHAT_MINI_PROGRAM', adapter, now)).resolves.toEqual({
      status: 'SUCCEEDED',
      taskId: 'task-1',
    });
    expect(send).toHaveBeenCalledWith({
      businessKey: 'APPOINTMENT_CREATED:appointment-1:HOST:host-1',
      channel: 'WECHAT_MINI_PROGRAM',
      payload: { appointmentId: 'appointment-1', hostName: '小雨' },
      providerAppId: 'wx-app-1',
      providerTemplateKey: 'template-1',
      recipientExternalSubject: 'openid-sensitive',
      variableKeys: ['thing1=hostName'],
    });
    const completion = transaction.notificationTask.updateMany.mock.calls.at(
      -1,
    )?.[0] as unknown as {
      data: { providerMessageId?: string; status: string };
    };
    expect(completion.data).toMatchObject({
      providerMessageId: 'message-1',
      status: 'SUCCEEDED',
    });
    const attempt = transaction.notificationDeliveryAttempt.create.mock
      .calls[0]?.[0] as unknown as {
      data: {
        attemptNumber: number;
        notificationTaskId: string;
        outcome: string;
        providerMessageId?: string;
      };
    };
    expect(attempt.data).toMatchObject({
      attemptNumber: 1,
      notificationTaskId: 'task-1',
      outcome: 'SUCCEEDED',
      providerMessageId: 'message-1',
    });
  });

  it('moves retryable provider failures to exponential backoff without exposing provider text', async () => {
    const { service, transaction } = createService();
    const adapter: NotificationChannelAdapter = {
      send: vi.fn().mockRejectedValue(new NotificationProviderError('WECHAT_BUSY', true)),
    };

    await expect(service.runOne('WECHAT_MINI_PROGRAM', adapter, now)).resolves.toEqual({
      status: 'RETRY_WAIT',
      taskId: 'task-1',
    });
    const completion = transaction.notificationTask.updateMany.mock.calls.at(
      -1,
    )?.[0] as unknown as {
      data: {
        lastErrorCode: string;
        lastErrorSummary: string;
        nextAttemptAt: Date;
        status: string;
      };
    };
    expect(completion.data).toMatchObject({
      lastErrorCode: 'WECHAT_BUSY',
      lastErrorSummary: '通知渠道暂不可用，系统将自动重试',
      nextAttemptAt: new Date('2026-07-22T12:00:30.000Z'),
      status: 'RETRY_WAIT',
    });
  });

  it('fails permanently when recipient identity or the active template is unavailable', async () => {
    const unavailable = {
      ...task,
      recipientUser: { identities: [] },
    };
    const { service, transaction } = createService({ task: unavailable });
    const adapter = { send: vi.fn() };

    await expect(service.runOne('WECHAT_MINI_PROGRAM', adapter, now)).resolves.toEqual({
      status: 'FAILED',
      taskId: 'task-1',
    });
    expect(adapter.send).not.toHaveBeenCalled();
    const completion = transaction.notificationTask.updateMany.mock.calls.at(
      -1,
    )?.[0] as unknown as {
      data: { failedAt: Date; lastErrorCode: string; status: string };
    };
    expect(completion.data).toMatchObject({
      failedAt: now,
      lastErrorCode: 'RECIPIENT_OR_TEMPLATE_UNAVAILABLE',
      status: 'FAILED',
    });
  });

  it('recovers one stale processing task before reporting an empty queue', async () => {
    const { service, transaction } = createService({
      claimed: false,
      stale: { attemptCount: 2, id: 'stale-task', maxAttempts: 5 },
    });
    const adapter = { send: vi.fn() };

    await expect(service.runOne('WECHAT_MINI_PROGRAM', adapter, now)).resolves.toEqual({
      status: 'EMPTY',
      taskId: null,
    });
    const recovery = transaction.notificationTask.updateMany.mock.calls[0]?.[0] as unknown as {
      data: { lastErrorCode: string; nextAttemptAt: Date; status: string };
    };
    expect(recovery.data).toMatchObject({
      lastErrorCode: 'WORKER_INTERRUPTED',
      nextAttemptAt: now,
      status: 'RETRY_WAIT',
    });
    expect(adapter.send).not.toHaveBeenCalled();
  });
});
