import { describe, expect, it, vi } from 'vitest';

import {
  AuthorizationDeniedError,
  AuthorizationPolicyService,
} from '../auth/authorization-policy.service';
import { NotificationTaskRetryConflictError } from './notification-task.errors';
import { NotificationTaskService } from './notification-task.service';

const siteId = '019b0000-0000-7000-8000-000000000001';
const taskId = '019b0000-0000-7000-8000-000000000002';
const retryId = '019b0000-0000-7000-8000-000000000003';
const userId = '019b0000-0000-7000-8000-000000000004';
const now = new Date('2026-07-23T08:00:00.000Z');
const source = {
  appointmentId: null,
  businessKey: 'REMINDER:test',
  id: taskId,
  lastErrorCode: 'WECHAT_HTTP_503',
  maxAttempts: 5,
  payload: { appointmentDateTime: '2026-07-24 09:30' },
  recipientNameSnapshot: '小雨',
  recipientProfileId: '019b0000-0000-7000-8000-000000000005',
  recipientRoleCode: 'HOST',
  recipientUserId: userId,
  retriedByTask: null,
  rowVersion: 4,
  siteId,
  sourceOutboxEventId: null,
  status: 'FAILED',
  templateVersionId: '019b0000-0000-7000-8000-000000000006',
};
const listTask = {
  attemptCount: 5,
  cancelledAt: null,
  createdAt: now,
  failedAt: now,
  id: taskId,
  lastErrorCode: 'WECHAT_HTTP_503',
  lastErrorSummary: '微信服务暂不可用',
  maxAttempts: 5,
  recipientNameSnapshot: '小雨',
  recipientRoleCode: 'HOST',
  recipientUserId: userId,
  retriedByTask: null,
  retryOfTaskId: null,
  rowVersion: 4,
  scheduledAt: now,
  sentAt: null,
  site: { name: '松江' },
  siteId,
  status: 'FAILED',
  templateVersion: { templateCode: 'APPOINTMENT_REMINDER' },
};
const admin = {
  actorName: '管理员',
  roleAssignmentId: 'role-1',
  roleCode: 'ADMIN' as const,
  siteId: null,
  userId,
};
const customerService = {
  ...admin,
  actorName: '松江客服',
  roleCode: 'CUSTOMER_SERVICE' as const,
  siteId,
};

function setup(sourceOverride: Readonly<Record<string, unknown>> = {}) {
  const client = {
    notificationTask: {
      count: vi.fn().mockResolvedValue(1),
      findMany: vi.fn().mockResolvedValue([listTask]),
    },
  };
  const transaction = {
    $queryRaw: vi.fn().mockResolvedValue([{ acquired: 1 }]),
    notificationTask: {
      create: vi.fn().mockResolvedValue({ id: retryId }),
      findUnique: vi.fn().mockResolvedValue({ ...source, ...sourceOverride }),
    },
  };
  const audit = { append: vi.fn().mockResolvedValue('audit-1') };
  const database = {
    read: vi.fn((operation: (value: typeof client) => unknown) => operation(client)),
    transaction: vi.fn((operation: (value: typeof transaction) => unknown) =>
      operation(transaction),
    ),
  };
  return {
    audit,
    client,
    service: new NotificationTaskService(
      audit as never,
      new AuthorizationPolicyService(),
      database as never,
    ),
    transaction,
  };
}

describe('NotificationTaskService', () => {
  it('scopes customer-service queries to its site and returns redacted summaries', async () => {
    const { client, service } = setup();
    await expect(
      service.list(customerService, { page: 1, pageSize: 50, status: 'FAILED' }),
    ).resolves.toMatchObject({
      items: [{ canRetry: true, lastErrorSummary: '微信服务暂不可用', recipientName: '小雨' }],
      total: 1,
    });

    const query = client.notificationTask.findMany.mock.calls[0]?.[0] as {
      where: { AND: unknown[] };
    };
    expect(query.where.AND).toContainEqual({ siteId });
    expect(JSON.stringify(query)).not.toContain('payload');
  });

  it('creates an immutable retry task and appends the operator reason to audit', async () => {
    const { audit, service, transaction } = setup();
    await expect(
      service.retry(admin, taskId, { expectedRowVersion: 4, reason: '微信服务恢复' }, now),
    ).resolves.toEqual({ id: retryId });

    const creation = transaction.notificationTask.create.mock.calls[0]?.[0] as unknown as {
      data: { businessKey: string; retryOfTaskId: string; scheduledAt: Date };
    };
    expect(creation.data).toMatchObject({
      businessKey: `MANUAL_RETRY:${taskId}`,
      retryOfTaskId: taskId,
      scheduledAt: now,
    });
    expect(audit.append).toHaveBeenCalledWith(
      transaction,
      admin,
      expect.objectContaining({ reason: '微信服务恢复' }),
    );
  });

  it('rejects permanent failures, stale rows, duplicate retries and cross-site operations', async () => {
    await expect(
      setup({ lastErrorCode: 'RECIPIENT_UNBOUND' }).service.retry(
        admin,
        taskId,
        { expectedRowVersion: 4, reason: '强制重试' },
        now,
      ),
    ).rejects.toBeInstanceOf(NotificationTaskRetryConflictError);
    await expect(
      setup().service.retry(admin, taskId, { expectedRowVersion: 3, reason: '过期页面' }, now),
    ).rejects.toBeInstanceOf(NotificationTaskRetryConflictError);
    await expect(
      setup({ retriedByTask: { id: retryId } }).service.retry(
        admin,
        taskId,
        { expectedRowVersion: 4, reason: '重复操作' },
        now,
      ),
    ).rejects.toBeInstanceOf(NotificationTaskRetryConflictError);
    await expect(
      setup({ siteId: '019b0000-0000-7000-8000-000000000099' }).service.retry(
        customerService,
        taskId,
        { expectedRowVersion: 4, reason: '跨场地' },
        now,
      ),
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
  });
});
