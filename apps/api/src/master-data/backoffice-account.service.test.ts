import { describe, expect, it, vi } from 'vitest';

import type { AuditCommandService } from '../audit/audit-command.service';
import { AuthorizationPolicyService } from '../auth/authorization-policy.service';
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
