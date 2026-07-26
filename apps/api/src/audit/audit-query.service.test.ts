import { describe, expect, it, vi } from 'vitest';

import {
  AuthorizationDeniedError,
  AuthorizationPolicyService,
} from '../auth/authorization-policy.service';
import { AuditQueryService } from './audit-query.service';

const siteId = '019f7a17-6845-7a90-94cb-e5f5caabd5f6';
const log = {
  action: 'APPOINTMENT_CREATED',
  actorNameSnapshot: '松江客服',
  actorRole: 'CUSTOMER_SERVICE',
  afterData: { status: 'BOOKED' },
  beforeData: null,
  createdAt: new Date('2026-07-26T08:00:00.000Z'),
  id: '019f7a17-6845-7a90-94cb-e5f5caabd5f7',
  objectId: '019f7a17-6845-7a90-94cb-e5f5caabd5f8',
  objectType: 'APPOINTMENT',
  reason: null,
  site: { name: '松江' },
  siteId,
};

function setup() {
  const client = {
    operationLog: {
      count: vi.fn().mockResolvedValue(1),
      findMany: vi.fn().mockResolvedValue([log]),
    },
  };
  const database = {
    read: vi.fn((callback: (value: typeof client) => unknown) => callback(client)),
  };
  return {
    client,
    service: new AuditQueryService(new AuthorizationPolicyService(), database as never),
  };
}

describe('AuditQueryService', () => {
  it('forces customer service to its own site', async () => {
    const { client, service } = setup();
    const result = await service.list(
      {
        roleAssignmentId: 'role-1',
        roleCode: 'CUSTOMER_SERVICE',
        siteId,
        userId: 'user-1',
      },
      { page: 1, pageSize: 50 },
    );

    expect(client.operationLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { siteId } }),
    );
    expect(result.items[0]).toMatchObject({ actorName: '松江客服', siteName: '松江' });
  });

  it('allows an administrator to filter one site', async () => {
    const { client, service } = setup();
    await service.list(
      {
        roleAssignmentId: 'role-2',
        roleCode: 'ADMIN',
        siteId: null,
        userId: 'user-2',
      },
      { action: 'APPOINTMENT_CREATED', page: 1, pageSize: 20, siteId },
    );
    expect(client.operationLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { action: 'APPOINTMENT_CREATED', siteId } }),
    );
  });

  it('rejects unsupported roles and cross-site customer-service filters', () => {
    const { service } = setup();
    expect(() =>
      service.list(
        {
          roleAssignmentId: 'role-1',
          roleCode: 'CUSTOMER_SERVICE',
          siteId,
          userId: 'user-1',
        },
        {
          page: 1,
          pageSize: 50,
          siteId: '019f7a17-6845-7a90-94cb-e5f5caabd5f9',
        },
      ),
    ).toThrow(AuthorizationDeniedError);
  });
});
