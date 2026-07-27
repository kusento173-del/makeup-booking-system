import type { Prisma } from '@makeup/database';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DatabaseService } from '../database/database.service';
import { BackofficeLoginDeniedError } from './backoffice-auth.errors';
import { BackofficeLoginService } from './backoffice-login.service';
import type { PasswordHasherService } from './password-hasher.service';

function createService(transaction: object, passwordMatches: boolean) {
  const verify = vi.fn().mockResolvedValue(passwordMatches);
  const database = {
    transaction: vi.fn((operation: (value: Prisma.TransactionClient) => unknown) =>
      operation(transaction as Prisma.TransactionClient),
    ),
  };
  const service = new BackofficeLoginService(
    database as unknown as DatabaseService,
    { verify } as unknown as PasswordHasherService,
  );

  return { service, verify };
}

function activeIdentity(
  failedAttemptCount = 0,
  roleCode = 'CUSTOMER_SERVICE',
  mustChangePassword = false,
) {
  return {
    status: 'ACTIVE',
    user: {
      id: 'user-1',
      passwordCredential: {
        failedAttemptCount,
        lockedUntil: null,
        mustChangePassword,
        passwordHash: 'argon2id-hash',
      },
      roles: [{ id: 'role-1', roleCode, siteId: 'site-1' }],
      status: 'ACTIVE',
    },
  };
}

describe('BackofficeLoginService', () => {
  afterEach(() => vi.useRealTimers());

  it('verifies an active account and resets prior failures', async () => {
    const update = vi.fn().mockResolvedValue({ userId: 'user-1' });
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([{ pg_advisory_xact_lock: null }]),
      passwordCredential: { update },
      userIdentity: { findUnique: vi.fn().mockResolvedValue(activeIdentity(2)) },
    };
    const { service } = createService(transaction, true);

    await expect(service.verify(' Admin.User ', 'correct passphrase')).resolves.toEqual({
      mustChangePassword: false,
      roles: [{ roleAssignmentId: 'role-1', roleCode: 'CUSTOMER_SERVICE', siteId: 'site-1' }],
      userId: 'user-1',
    });
    expect(update).toHaveBeenCalledWith({
      data: { failedAttemptCount: 0, lockedUntil: null },
      where: { userId: 'user-1' },
    });
  });

  it('locks the account for 15 minutes on the fifth consecutive failure', async () => {
    const now = new Date('2026-07-22T04:00:00.000Z');
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const update = vi.fn().mockResolvedValue({ userId: 'user-1' });
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([{ pg_advisory_xact_lock: null }]),
      passwordCredential: { update },
      userIdentity: { findUnique: vi.fn().mockResolvedValue(activeIdentity(4)) },
    };
    const { service } = createService(transaction, false);

    await expect(service.verify('admin.user', 'wrong passphrase')).rejects.toBeInstanceOf(
      BackofficeLoginDeniedError,
    );
    expect(update).toHaveBeenCalledWith({
      data: {
        failedAttemptCount: 5,
        lockedUntil: new Date('2026-07-22T04:15:00.000Z'),
      },
      where: { userId: 'user-1' },
    });
  });

  it('accepts a mobile web role and reports that its temporary password must change', async () => {
    const update = vi.fn().mockResolvedValue({ userId: 'user-1' });
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([{ pg_advisory_xact_lock: null }]),
      passwordCredential: { update },
      userIdentity: { findUnique: vi.fn().mockResolvedValue(activeIdentity(0, 'HOST', true)) },
    };
    const { service } = createService(transaction, true);

    await expect(service.verify('000001', 'temporary password')).resolves.toEqual({
      mustChangePassword: true,
      roles: [{ roleAssignmentId: 'role-1', roleCode: 'HOST', siteId: 'site-1' }],
      userId: 'user-1',
    });
  });

  it('performs a dummy verification for an unknown login name', async () => {
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([{ pg_advisory_xact_lock: null }]),
      userIdentity: { findUnique: vi.fn().mockResolvedValue(null) },
    };
    const { service, verify } = createService(transaction, false);

    await expect(service.verify('unknown.user', 'submitted password')).rejects.toBeInstanceOf(
      BackofficeLoginDeniedError,
    );
    expect(verify).toHaveBeenCalledWith(null, 'submitted password');
  });
});
