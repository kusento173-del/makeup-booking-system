import type { Prisma } from '@makeup/database';
import { describe, expect, it, vi } from 'vitest';

import type { AuditCommandService } from '../audit/audit-command.service';
import type { DatabaseService } from '../database/database.service';
import { InitialAdminAlreadyExistsError } from './initial-admin.errors';
import { InitialAdminService } from './initial-admin.service';

function createService(transaction: object) {
  const append = vi.fn().mockResolvedValue('audit-1');
  const database = {
    transaction: vi.fn((operation: (value: Prisma.TransactionClient) => unknown) =>
      operation(transaction as Prisma.TransactionClient),
    ),
  };
  const passwords = {
    assertPassword: vi.fn(),
    hash: vi.fn().mockResolvedValue('argon2id-hash'),
    verify: vi.fn(),
  };
  const service = new InitialAdminService(
    { append } as unknown as AuditCommandService,
    database as unknown as DatabaseService,
    passwords,
  );

  return { append, passwords, service };
}

describe('InitialAdminService', () => {
  it('creates exactly one password identity and global administrator role with a safe audit', async () => {
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([{ pg_advisory_xact_lock: null }]),
      appUser: { create: vi.fn().mockResolvedValue({ id: 'user-1' }) },
      passwordCredential: { create: vi.fn().mockResolvedValue({ userId: 'user-1' }) },
      userIdentity: {
        create: vi.fn().mockResolvedValue({ id: 'identity-1' }),
        findUnique: vi.fn().mockResolvedValue(null),
      },
      userRole: {
        count: vi.fn().mockResolvedValue(0),
        create: vi.fn().mockResolvedValue({ id: 'role-1' }),
      },
    };
    const { append, passwords, service } = createService(transaction);

    await expect(service.create(' Admin.Root ', ' 首位管理员 ', 'safe password')).resolves.toEqual({
      loginName: 'admin.root',
      userId: 'user-1',
    });
    expect(passwords.hash).toHaveBeenCalledWith('safe password');
    expect(transaction.userIdentity.create).toHaveBeenCalledWith({
      data: {
        externalSubject: 'admin.root',
        provider: 'PASSWORD',
        providerAppId: 'BACKOFFICE',
        userId: 'user-1',
      },
    });
    expect(transaction.passwordCredential.create).toHaveBeenCalledWith({
      data: { passwordHash: 'argon2id-hash', userId: 'user-1' },
    });
    expect(transaction.userRole.create).toHaveBeenCalledWith({
      data: { roleCode: 'ADMIN', userId: 'user-1' },
      select: { id: true },
    });
    expect(append).toHaveBeenCalledWith(
      transaction,
      { actorName: '系统初始化', roleCode: 'SYSTEM' },
      {
        action: 'INITIAL_ADMIN_CREATED',
        afterData: { loginName: 'admin.root', roleAssignmentId: 'role-1' },
        objectId: 'user-1',
        objectType: 'APP_USER',
      },
    );
    expect(JSON.stringify(append.mock.calls)).not.toContain('safe password');
    expect(JSON.stringify(append.mock.calls)).not.toContain('argon2id');
  });

  it('refuses to run after an administrator exists and writes nothing', async () => {
    const createUser = vi.fn();
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([{ pg_advisory_xact_lock: null }]),
      appUser: { create: createUser },
      userRole: { count: vi.fn().mockResolvedValue(1) },
    };
    const { service } = createService(transaction);

    await expect(service.create('admin', '管理员', 'safe password')).rejects.toBeInstanceOf(
      InitialAdminAlreadyExistsError,
    );
    expect(createUser).not.toHaveBeenCalled();
  });
});
