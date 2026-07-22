import type { Prisma } from '@makeup/database';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DatabaseService } from '../database/database.service';
import { AuthSessionInvalidError } from './auth-session.errors';
import { RoleSelectionChallengeService } from './role-selection-challenge.service';

function createService(transaction: object) {
  const database = {
    transaction: vi.fn((operation: (value: Prisma.TransactionClient) => unknown) =>
      operation(transaction as Prisma.TransactionClient),
    ),
  };
  const tokens = {
    generate: vi.fn().mockReturnValue('selection-token'),
    hash: vi.fn((value) => `hash:${value}`),
  };

  return new RoleSelectionChallengeService(database as unknown as DatabaseService, tokens);
}

describe('RoleSelectionChallengeService', () => {
  afterEach(() => vi.useRealTimers());

  it('issues one short-lived challenge for all current active roles', async () => {
    const now = new Date('2026-07-22T04:00:00.000Z');
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const transaction = {
      appUser: {
        findUnique: vi.fn().mockResolvedValue({
          roles: [
            { id: 'role-host', roleCode: 'HOST', siteId: null },
            { id: 'role-operator', roleCode: 'OPERATOR', siteId: null },
          ],
          status: 'ACTIVE',
        }),
      },
      authRoleSelectionChallenge: {
        create: vi.fn().mockResolvedValue({ id: 'challenge-1' }),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const service = createService(transaction);

    await expect(service.issue('user-1')).resolves.toEqual({
      expiresAt: new Date('2026-07-22T04:05:00.000Z'),
      roles: [
        { roleAssignmentId: 'role-host', roleCode: 'HOST', siteId: null },
        { roleAssignmentId: 'role-operator', roleCode: 'OPERATOR', siteId: null },
      ],
      token: 'selection-token',
    });
  });

  it('atomically consumes a challenge only for a role owned by its active account', async () => {
    const transaction = {
      authRoleSelectionChallenge: {
        findUnique: vi.fn().mockResolvedValue({
          consumedAt: null,
          expiresAt: new Date(Date.now() + 60_000),
          id: 'challenge-1',
          revokedAt: null,
          user: { roles: [{ id: 'role-1' }], status: 'ACTIVE' },
          userId: 'user-1',
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const service = createService(transaction);

    await expect(service.consume('selection-token', 'role-1')).resolves.toBe('user-1');
  });

  it('rejects a consumed, expired, disabled or mismatched challenge', async () => {
    const transaction = {
      authRoleSelectionChallenge: {
        findUnique: vi.fn().mockResolvedValue({
          consumedAt: null,
          expiresAt: new Date(Date.now() + 60_000),
          id: 'challenge-1',
          revokedAt: null,
          user: { roles: [], status: 'ACTIVE' },
          userId: 'user-1',
        }),
        updateMany: vi.fn(),
      },
    };
    const service = createService(transaction);

    await expect(service.consume('selection-token', 'role-other')).rejects.toBeInstanceOf(
      AuthSessionInvalidError,
    );
    expect(transaction.authRoleSelectionChallenge.updateMany).not.toHaveBeenCalled();
  });
});
