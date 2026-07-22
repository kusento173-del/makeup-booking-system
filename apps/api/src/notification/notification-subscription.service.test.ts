import { describe, expect, it, vi } from 'vitest';

import {
  AuthorizationDeniedError,
  AuthorizationPolicyService,
} from '../auth/authorization-policy.service';
import { NotificationSubscriptionStateConflictError } from './notification-subscription.errors';
import { NotificationSubscriptionService } from './notification-subscription.service';

const context = {
  roleAssignmentId: 'role-1',
  roleCode: 'HOST' as const,
  siteId: '019b0000-0000-7000-8000-000000000010',
  userId: '019b0000-0000-7000-8000-000000000011',
};
const requestId = '019b0000-0000-7000-8000-000000000012';
const templates = [
  {
    channel: 'WECHAT_MINI_PROGRAM',
    id: '019b0000-0000-7000-8000-000000000013',
    providerTemplateKey: 'wechat-template-1',
    status: 'ACTIVE',
    subscriptionType: 'ONE_TIME',
    templateCode: 'APPOINTMENT_CREATED',
  },
  {
    channel: 'WECHAT_MINI_PROGRAM',
    id: '019b0000-0000-7000-8000-000000000014',
    providerTemplateKey: 'wechat-template-2',
    status: 'ACTIVE',
    subscriptionType: 'PERMANENT',
    templateCode: 'APPOINTMENT_CANCELLED',
  },
];

function setup() {
  const transaction = {
    $queryRaw: vi.fn().mockResolvedValue([{ acquired: 1 }]),
    notificationSubscriptionDecision: {
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    notificationTemplateVersion: { findMany: vi.fn().mockResolvedValue([templates[0]]) },
  };
  const client = {
    notificationTemplateVersion: { findMany: vi.fn().mockResolvedValue(templates) },
  };
  const database = {
    read: vi.fn((operation: (value: typeof client) => unknown) => operation(client)),
    transaction: vi.fn((operation: (value: typeof transaction) => unknown) =>
      operation(transaction),
    ),
  };
  return {
    service: new NotificationSubscriptionService(
      new AuthorizationPolicyService(),
      database as never,
    ),
    transaction,
  };
}

describe('NotificationSubscriptionService', () => {
  it('returns active templates in separate one-time and permanent groups', async () => {
    const { service } = setup();
    await expect(service.listActive(context)).resolves.toEqual([
      expect.objectContaining({
        subscriptionType: 'ONE_TIME',
        templates: [expect.objectContaining({ templateVersionId: templates[0]?.id })],
      }),
      expect.objectContaining({
        subscriptionType: 'PERMANENT',
        templates: [expect.objectContaining({ templateVersionId: templates[1]?.id })],
      }),
    ]);
  });

  it('records an immutable decision snapshot and replays the same request idempotently', async () => {
    const { service, transaction } = setup();
    const command = {
      decisions: [{ decision: 'ACCEPT' as const, templateVersionId: templates[0]?.id as string }],
      requestId,
    };
    await expect(service.record(context, command)).resolves.toEqual({
      recordedCount: 1,
      requestId,
    });
    expect(transaction.notificationSubscriptionDecision.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ decision: 'ACCEPT', roleCode: 'HOST', userId: context.userId }),
      ],
    });

    transaction.notificationSubscriptionDecision.findMany.mockResolvedValue([
      { decision: 'ACCEPT', templateVersionId: templates[0]?.id },
    ]);
    await expect(service.record(context, command)).resolves.toEqual({
      recordedCount: 1,
      requestId,
    });
    expect(transaction.notificationSubscriptionDecision.createMany).toHaveBeenCalledTimes(1);
  });

  it('rejects mixed template types, changed replays, and backoffice roles', async () => {
    const { service, transaction } = setup();
    transaction.notificationTemplateVersion.findMany.mockResolvedValue(templates);
    await expect(
      service.record(context, {
        decisions: templates.map((template) => ({
          decision: 'ACCEPT' as const,
          templateVersionId: template.id,
        })),
        requestId,
      }),
    ).rejects.toThrow(NotificationSubscriptionStateConflictError);

    await expect(service.listActive({ ...context, roleCode: 'CUSTOMER_SERVICE' })).rejects.toThrow(
      AuthorizationDeniedError,
    );
  });
});
