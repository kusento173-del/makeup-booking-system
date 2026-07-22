import { describe, expect, it, vi } from 'vitest';

import type { AuditCommandService } from '../audit/audit-command.service';
import { AuthorizationPolicyService } from '../auth/authorization-policy.service';
import type { PasswordHasherService } from '../auth/password-hasher.service';
import type { DatabaseService } from '../database/database.service';
import {
  BackofficeAccountConflictError,
  LastAdministratorError,
} from './backoffice-account.errors';
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
      data: { passwordHash: 'secret-password-hash', userId: 'user-2' },
    });
    expect(JSON.stringify(append.mock.calls)).not.toContain('secret-password-hash');
    expect(JSON.stringify(append.mock.calls)).not.toContain('Correct Horse 123');
  });

  it('prevents disabling the last active administrator', async () => {
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
      userRole: { count: vi.fn().mockResolvedValue(1) },
    };
    const { value } = service(transaction);

    await expect(
      value.update(context, {
        displayName: '管理员',
        expectedRowVersion: 1,
        id: 'user-admin',
        reason: '测试停用',
        status: 'DISABLED',
      }),
    ).rejects.toBeInstanceOf(LastAdministratorError);
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
