import type { Prisma } from '@makeup/database';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AuditCommandService } from '../audit/audit-command.service';
import type { DatabaseService } from '../database/database.service';
import { AuthRequestInvalidError } from './auth-request.parser';
import { BackofficeLoginDeniedError } from './backoffice-auth.errors';
import { BackofficePasswordService } from './backoffice-password.service';

const authorization = {
  expiresAt: new Date('2026-07-22T05:15:00.000Z'),
  roleAssignmentId: 'role-1',
  roleCode: 'ADMIN' as const,
  sessionId: 'session-1',
  siteId: null,
  userId: 'user-1',
};

function createService(transaction: object, currentMatches = true) {
  const append = vi.fn().mockResolvedValue('audit-1');
  const runTransaction = vi.fn((operation: (value: Prisma.TransactionClient) => unknown) =>
    operation(transaction as Prisma.TransactionClient),
  );
  const database = {
    transaction: runTransaction,
  };
  const passwords = {
    assertPassword: vi.fn(),
    hash: vi.fn().mockResolvedValue('next-argon2id-hash'),
    verify: vi.fn().mockResolvedValue(currentMatches),
  };
  const service = new BackofficePasswordService(
    { append } as unknown as AuditCommandService,
    database as unknown as DatabaseService,
    passwords,
  );

  return { append, runTransaction, service };
}

describe('BackofficePasswordService', () => {
  afterEach(() => vi.useRealTimers());

  it('changes the hash, revokes every session and audits without password material', async () => {
    const now = new Date('2026-07-22T05:00:00.000Z');
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const updateCredential = vi.fn().mockResolvedValue({ userId: 'user-1' });
    const revokeSessions = vi.fn().mockResolvedValue({ count: 3 });
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([{ pg_advisory_xact_lock: null }]),
      appUser: {
        findUnique: vi.fn().mockResolvedValue({
          displayName: '管理员',
          passwordCredential: { passwordHash: 'old-argon2id-hash' },
          roles: [{ id: 'role-1' }],
          status: 'ACTIVE',
        }),
      },
      authSession: { updateMany: revokeSessions },
      passwordCredential: { update: updateCredential },
    };
    const { append, service } = createService(transaction);

    await expect(
      service.change({
        authorization,
        clientType: 'ADMIN_WEB',
        currentPassword: 'current password',
        ipAddress: '127.0.0.1',
        newPassword: 'next password',
      }),
    ).resolves.toBeUndefined();
    expect(updateCredential).toHaveBeenCalledWith({
      data: {
        failedAttemptCount: 0,
        lockedUntil: null,
        passwordChangedAt: now,
        passwordHash: 'next-argon2id-hash',
      },
      where: { userId: 'user-1' },
    });
    expect(revokeSessions).toHaveBeenCalledWith({
      data: {
        revokeReason: 'PASSWORD_CHANGED',
        revokedAt: now,
        rowVersion: { increment: 1 },
      },
      where: { revokedAt: null, userId: 'user-1' },
    });
    expect(append).toHaveBeenCalledWith(
      transaction,
      {
        actorName: '管理员',
        clientType: 'ADMIN_WEB',
        ipAddress: '127.0.0.1',
        roleCode: 'ADMIN',
        userId: 'user-1',
      },
      {
        action: 'PASSWORD_CHANGED',
        afterData: { passwordChangedAt: now.toISOString(), revokedSessionCount: 3 },
        objectId: 'user-1',
        objectType: 'APP_USER',
        siteId: undefined,
      },
    );
    expect(JSON.stringify(append.mock.calls)).not.toContain('current password');
    expect(JSON.stringify(append.mock.calls)).not.toContain('next password');
    expect(JSON.stringify(append.mock.calls)).not.toContain('argon2id');
  });

  it('rejects an incorrect current password without changing credentials', async () => {
    const updateCredential = vi.fn();
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([{ pg_advisory_xact_lock: null }]),
      appUser: {
        findUnique: vi.fn().mockResolvedValue({
          displayName: '客服',
          passwordCredential: { passwordHash: 'old-hash' },
          roles: [{ id: 'role-1' }],
          status: 'ACTIVE',
        }),
      },
      passwordCredential: { update: updateCredential },
    };
    const { service } = createService(transaction, false);

    await expect(
      service.change({
        authorization,
        currentPassword: 'incorrect password',
        newPassword: 'valid new password',
      }),
    ).rejects.toBeInstanceOf(BackofficeLoginDeniedError);
    expect(updateCredential).not.toHaveBeenCalled();
  });

  it('rejects reusing the current password before opening a transaction', async () => {
    const { runTransaction, service } = createService({});

    await expect(
      service.change({
        authorization,
        currentPassword: 'same password',
        newPassword: 'same password',
      }),
    ).rejects.toBeInstanceOf(AuthRequestInvalidError);
    expect(runTransaction).not.toHaveBeenCalled();
  });
});
