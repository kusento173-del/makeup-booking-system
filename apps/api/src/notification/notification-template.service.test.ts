import { describe, expect, it, vi } from 'vitest';

import {
  AuthorizationDeniedError,
  AuthorizationPolicyService,
} from '../auth/authorization-policy.service';
import { NotificationTemplateRequestInvalidError } from './notification-template.errors';
import { NotificationTemplateService } from './notification-template.service';

const now = new Date('2026-07-22T14:00:00.000Z');
const draft = {
  activatedAt: null,
  channel: 'WECHAT_MINI_PROGRAM',
  createdAt: now,
  id: '019b0000-0000-7000-8000-000000000001',
  providerTemplateKey: 'template-2',
  recipientRoleCode: 'HOST',
  retiredAt: null,
  rowVersion: 1,
  status: 'DRAFT',
  subscriptionType: 'ONE_TIME',
  templateCode: 'APPOINTMENT_NOTICE',
  variableKeys: ['thing1=hostName', 'time2=timeRange'],
  version: 2,
};
const active = {
  ...draft,
  activatedAt: new Date('2026-07-20T00:00:00.000Z'),
  id: '019b0000-0000-7000-8000-000000000002',
  providerTemplateKey: 'template-1',
  rowVersion: 2,
  status: 'ACTIVE',
  version: 1,
};
const admin = {
  actorName: '管理员',
  roleAssignmentId: 'role-1',
  roleCode: 'ADMIN' as const,
  siteId: null,
  userId: '019b0000-0000-7000-8000-000000000003',
};

function setup() {
  const transaction = {
    $queryRaw: vi.fn().mockResolvedValue([{ acquired: 1 }]),
    notificationTemplateVersion: {
      create: vi.fn().mockResolvedValue(draft),
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn().mockResolvedValue(draft),
      update: vi.fn().mockResolvedValue({
        ...active,
        retiredAt: now,
        rowVersion: 3,
        status: 'RETIRED',
      }),
      updateManyAndReturn: vi
        .fn()
        .mockResolvedValue([{ ...draft, activatedAt: now, rowVersion: 2, status: 'ACTIVE' }]),
    },
  };
  const client = {
    notificationTemplateVersion: {
      findFirst: vi.fn().mockResolvedValue(draft),
      findMany: vi.fn().mockResolvedValue([draft]),
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
    service: new NotificationTemplateService(
      audit as never,
      new AuthorizationPolicyService(),
      database as never,
    ),
    transaction,
  };
}

describe('NotificationTemplateService', () => {
  it('creates the next immutable draft version with an audit entry', async () => {
    const { audit, service, transaction } = setup();
    transaction.notificationTemplateVersion.findFirst.mockResolvedValue({ version: 1 });

    await expect(
      service.createDraft(admin, {
        providerTemplateKey: 'template-2',
        recipientRoleCode: 'HOST',
        subscriptionType: 'ONE_TIME',
        templateCode: 'APPOINTMENT_NOTICE',
        variableMappings: ['thing1=hostName', 'time2=timeRange'],
      }),
    ).resolves.toMatchObject({ status: 'DRAFT', version: 2 });

    const create = transaction.notificationTemplateVersion.create.mock.calls[0]?.[0] as unknown as {
      data: { version: number };
    };
    expect(create.data.version).toBe(2);
    expect(audit.append).toHaveBeenCalledOnce();
  });

  it('atomically retires the old active version when activating a draft', async () => {
    const { audit, service, transaction } = setup();
    transaction.notificationTemplateVersion.findFirst.mockResolvedValue(active);

    await expect(
      service.activate(admin, draft.id, { expectedRowVersion: 1 }, now),
    ).resolves.toMatchObject({ activatedAt: now.toISOString(), status: 'ACTIVE' });

    expect(transaction.notificationTemplateVersion.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: active.id } }),
    );
    expect(audit.append).toHaveBeenCalledTimes(2);
  });

  it('returns a safe preview and rejects unsupported mappings before persistence', async () => {
    const { service, transaction } = setup();
    await expect(service.preview(admin, draft.id)).resolves.toMatchObject({
      data: { thing1: { value: '小雨' }, time2: { value: '09:30~10:00' } },
    });

    expect(() =>
      service.createDraft(admin, {
        providerTemplateKey: 'template-3',
        recipientRoleCode: 'HOST',
        subscriptionType: 'ONE_TIME',
        templateCode: 'APPOINTMENT_NOTICE',
        variableMappings: ['thing1=unknownField'],
      }),
    ).toThrow(NotificationTemplateRequestInvalidError);
    expect(transaction.notificationTemplateVersion.create).not.toHaveBeenCalled();
  });

  it('allows customer service to read but never modify templates', async () => {
    const { service } = setup();
    const customerService = {
      ...admin,
      roleCode: 'CUSTOMER_SERVICE' as const,
      siteId: '019b0000-0000-7000-8000-000000000004',
    };

    await expect(service.list(customerService)).resolves.toHaveLength(1);
    expect(() =>
      service.createDraft(customerService, {
        providerTemplateKey: 'template-3',
        recipientRoleCode: 'HOST',
        subscriptionType: 'ONE_TIME',
        templateCode: 'APPOINTMENT_NOTICE',
        variableMappings: ['thing1=hostName'],
      }),
    ).toThrow(AuthorizationDeniedError);
  });
});
