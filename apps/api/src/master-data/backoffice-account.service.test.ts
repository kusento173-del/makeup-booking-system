import { describe, expect, it, vi } from 'vitest';

import type { AuditCommandService } from '../audit/audit-command.service';
import {
  AuthorizationDeniedError,
  AuthorizationPolicyService,
} from '../auth/authorization-policy.service';
import type { PasswordHasherService } from '../auth/password-hasher.service';
import type { DatabaseService } from '../database/database.service';
import { BackofficeAccountConflictError } from './backoffice-account.errors';
import { BackofficeAccountService } from './backoffice-account.service';
import type { BackofficeAccountContext } from './backoffice-account.types';

const context: BackofficeAccountContext = {
  actorName: '管理员',
  roleAssignmentId: 'role-admin',
  roleCode: 'ADMIN',
  siteId: null,
  userId: 'user-admin',
};

const customerServiceContext: BackofficeAccountContext = {
  actorName: '松江客服',
  roleAssignmentId: 'role-customer-service',
  roleCode: 'CUSTOMER_SERVICE',
  siteId: 'site-songjiang',
  userId: 'user-customer-service',
};

function service(transaction: object) {
  const append = vi.fn().mockResolvedValue('audit-1');
  const hash = vi.fn().mockResolvedValue('secret-password-hash');
  const database = {
    read: vi.fn((operation: (value: object) => unknown) => operation(transaction)),
    transaction: vi.fn((operation: (value: object) => unknown) => operation(transaction)),
  };
  return {
    append,
    hash,
    value: new BackofficeAccountService(
      { append } as unknown as AuditCommandService,
      new AuthorizationPolicyService(),
      database as unknown as DatabaseService,
      { assertPassword: vi.fn(), hash } as unknown as PasswordHasherService,
    ),
  };
}

describe('BackofficeAccountService', () => {
  it('returns profile roles and filters accounts by any effective role', async () => {
    let receivedQuery: unknown;
    const transaction = {
      appUser: {
        count: vi.fn().mockResolvedValue(1),
        findMany: vi.fn((query: unknown) => {
          receivedQuery = query;
          return Promise.resolve([
            {
              displayName: '阿伟',
              id: 'user-host',
              identities: [{ externalSubject: '000001' }],
              roles: [
                {
                  id: 'role-host',
                  roleCode: 'HOST',
                  rowVersion: 1,
                  siteId: 'site-songjiang',
                },
              ],
              rowVersion: 1,
              status: 'ACTIVE',
            },
          ]);
        }),
      },
    };
    const { value } = service(transaction);

    await expect(
      value.list(context, { page: 1, pageSize: 50, roleCode: 'HOST' }),
    ).resolves.toMatchObject({
      items: [{ loginName: '000001', roles: [{ roleCode: 'HOST' }] }],
      total: 1,
    });
    const query = receivedQuery as {
      readonly select: { readonly roles: { readonly where: unknown } };
      readonly where: { readonly AND: readonly unknown[] };
    };
    expect(query.select.roles.where).toEqual({ revokedAt: null });
    expect(query.where.AND).toContainEqual({
      roles: { some: { revokedAt: null, roleCode: 'HOST' } },
    });
  });

  it('creates a scoped password account and never audits credential material', async () => {
    const transaction = {
      appUser: { create: vi.fn().mockResolvedValue({ id: 'user-2' }) },
      passwordCredential: { create: vi.fn().mockResolvedValue({}) },
      site: { findUnique: vi.fn().mockResolvedValue({ status: 'ACTIVE' }) },
      userIdentity: { create: vi.fn().mockResolvedValue({}) },
      userRole: { create: vi.fn().mockResolvedValue({ id: 'role-2' }) },
    };
    const { append, value } = service(transaction);

    await expect(
      value.create(context, {
        displayName: '松江客服',
        loginName: 'service.sj',
        password: 'Correct Horse 123',
        roleCode: 'CUSTOMER_SERVICE',
        siteId: 'site-1',
      }),
    ).resolves.toBe('user-2');
    expect(transaction.passwordCredential.create).toHaveBeenCalledWith({
      data: {
        mustChangePassword: true,
        passwordHash: 'secret-password-hash',
        userId: 'user-2',
      },
    });
    expect(JSON.stringify(append.mock.calls)).not.toContain('secret-password-hash');
    expect(JSON.stringify(append.mock.calls)).not.toContain('Correct Horse 123');
  });

  it('limits customer service account listings to its site while retaining read-only admins', async () => {
    let receivedWhere: unknown;
    const transaction = {
      appUser: {
        count: vi.fn().mockResolvedValue(0),
        findMany: vi.fn((query: { where: unknown }) => {
          receivedWhere = query.where;
          return Promise.resolve([]);
        }),
      },
    };
    const { value } = service(transaction);

    await value.list(customerServiceContext, { page: 1, pageSize: 50 });

    expect(receivedWhere).toEqual({
      AND: [
        expect.any(Object),
        {
          OR: [
            { roles: { some: { revokedAt: null, roleCode: 'ADMIN' } } },
            { roles: { some: { revokedAt: null, siteId: 'site-songjiang' } } },
            { hostProfile: { is: { siteId: 'site-songjiang' } } },
            { artistProfile: { is: { siteId: 'site-songjiang' } } },
            { operatorProfile: { is: { siteId: 'site-songjiang' } } },
          ],
        },
      ],
    });
  });

  it('allows customer service to create only customer-service accounts for its own site', async () => {
    const transaction = {
      appUser: { create: vi.fn().mockResolvedValue({ id: 'user-2' }) },
      passwordCredential: { create: vi.fn().mockResolvedValue({}) },
      site: { findUnique: vi.fn().mockResolvedValue({ status: 'ACTIVE' }) },
      userIdentity: { create: vi.fn().mockResolvedValue({}) },
      userRole: { create: vi.fn().mockResolvedValue({ id: 'role-2' }) },
    };
    const { value } = service(transaction);

    await expect(
      value.create(customerServiceContext, {
        displayName: '松江客服二号',
        loginName: 'service.sj.2',
        password: 'Correct Horse 123',
        roleCode: 'CUSTOMER_SERVICE',
        siteId: 'site-songjiang',
      }),
    ).resolves.toBe('user-2');
    await expect(
      value.create(customerServiceContext, {
        displayName: '越权管理员',
        loginName: 'admin.by.cs',
        password: 'Correct Horse 123',
        roleCode: 'ADMIN',
      }),
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
  });

  it('prevents customer service from editing an administrator account', async () => {
    const transaction = {
      appUser: {
        findUnique: vi.fn().mockResolvedValue({
          artistProfile: null,
          displayName: '管理员',
          hostProfile: null,
          id: 'user-admin',
          operatorProfile: null,
          roles: [{ roleCode: 'ADMIN', siteId: null }],
          rowVersion: 1,
          status: 'ACTIVE',
        }),
        updateMany: vi.fn(),
      },
    };
    const { value } = service(transaction);

    await expect(
      value.update(customerServiceContext, {
        displayName: '不能修改',
        expectedRowVersion: 1,
        id: 'user-admin',
        reason: '越权测试',
      }),
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
    expect(transaction.appUser.updateMany).not.toHaveBeenCalled();
  });

  it('allows customer service to edit an own-site non-admin account', async () => {
    const transaction = {
      appUser: {
        findUnique: vi.fn().mockResolvedValue({
          artistProfile: null,
          displayName: '松江主播',
          hostProfile: { siteId: 'site-songjiang' },
          id: 'user-host',
          operatorProfile: null,
          roles: [{ roleCode: 'HOST', siteId: 'site-songjiang' }],
          rowVersion: 1,
          status: 'ACTIVE',
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const { value } = service(transaction);

    await expect(
      value.update(customerServiceContext, {
        displayName: '松江主播新名称',
        expectedRowVersion: 1,
        id: 'user-host',
        reason: '修正账号名称',
      }),
    ).resolves.toBeUndefined();
  });

  it('prevents customer service from editing another site account', async () => {
    const transaction = {
      appUser: {
        findUnique: vi.fn().mockResolvedValue({
          artistProfile: null,
          displayName: '现厂主播',
          hostProfile: { siteId: 'site-xianchang' },
          id: 'user-host',
          operatorProfile: null,
          roles: [{ roleCode: 'HOST', siteId: 'site-xianchang' }],
          rowVersion: 1,
          status: 'ACTIVE',
        }),
        updateMany: vi.fn(),
      },
    };
    const { value } = service(transaction);

    await expect(
      value.update(customerServiceContext, {
        displayName: '不应修改',
        expectedRowVersion: 1,
        id: 'user-host',
        reason: '越权测试',
      }),
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
    expect(transaction.appUser.updateMany).not.toHaveBeenCalled();
  });

  it('prevents deleting an administrator account', async () => {
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([{ acquired: 1 }]),
      appUser: {
        findUnique: vi.fn().mockResolvedValue({
          displayName: '管理员',
          id: 'user-admin',
          roles: [{ roleCode: 'ADMIN' }],
          rowVersion: 1,
          status: 'ACTIVE',
        }),
        updateMany: vi.fn(),
      },
    };
    const { value } = service(transaction);

    await expect(
      value.delete(context, {
        expectedRowVersion: 1,
        id: 'user-admin',
        reason: '测试删除',
      }),
    ).rejects.toBeInstanceOf(BackofficeAccountConflictError);
    expect(transaction.appUser.updateMany).not.toHaveBeenCalled();
  });

  it('does not assign a backoffice role to an account without a password identity', async () => {
    const transaction = {
      appUser: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ id: 'user-mobile', identities: [], status: 'ACTIVE' }),
      },
    };
    const { value } = service(transaction);

    await expect(
      value.assignRole(context, { roleCode: 'ADMIN', userId: 'user-mobile' }),
    ).rejects.toBeInstanceOf(BackofficeAccountConflictError);
  });
});
