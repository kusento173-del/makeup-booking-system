import type { Prisma } from '@makeup/database';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DatabaseService } from '../database/database.service';
import type { AccessTokenService } from './access-token.service';
import { AuthSessionInvalidError } from './auth-session.errors';
import { AuthSessionService } from './auth-session.service';

const activeRole = { id: 'role-1', roleCode: 'HOST', siteId: null };

function createService(transaction: object, readClient = transaction) {
  const issue = vi
    .fn()
    .mockImplementation((_userId: string, sessionId: string, _role: object, now: Date) =>
      Promise.resolve({
        expiresAt: new Date(now.getTime() + 15 * 60 * 1000),
        token: `access:${sessionId}`,
      }),
    );
  const verify = vi.fn();
  const generate = vi
    .fn<() => string>()
    .mockReturnValueOnce('refresh-current')
    .mockReturnValueOnce('refresh-next');
  const database = {
    read: vi.fn((operation: (value: object) => unknown) => operation(readClient)),
    transaction: vi.fn((operation: (value: Prisma.TransactionClient) => unknown) =>
      operation(transaction as Prisma.TransactionClient),
    ),
  };
  const service = new AuthSessionService(
    { issue, verify } as unknown as AccessTokenService,
    database as unknown as DatabaseService,
    { generate, hash: (token: string) => `hash:${token}` },
  );

  return { database, generate, issue, service, verify };
}

describe('AuthSessionService', () => {
  afterEach(() => vi.useRealTimers());

  it('creates a role-bound session and updates the last-login timestamp atomically', async () => {
    const now = new Date('2026-07-22T04:00:00.000Z');
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const transaction = {
      appUser: { update: vi.fn().mockResolvedValue({ id: 'user-1' }) },
      authSession: { create: vi.fn().mockResolvedValue({ id: 'session-1' }) },
      userRole: { findFirst: vi.fn().mockResolvedValue(activeRole) },
    };
    const { service } = createService(transaction);

    const result = await service.create('user-1', 'role-1');

    expect(result).toMatchObject({
      accessToken: 'access:session-1',
      refreshToken: 'refresh-current',
      role: { roleAssignmentId: 'role-1', roleCode: 'HOST', siteId: null },
      sessionId: 'session-1',
      userId: 'user-1',
    });
    expect(transaction.authSession.create).toHaveBeenCalledWith({
      data: {
        expiresAt: new Date('2026-08-21T04:00:00.000Z'),
        refreshTokenHash: 'hash:refresh-current',
        roleAssignmentId: 'role-1',
        userId: 'user-1',
      },
      select: { id: true },
    });
    expect(transaction.appUser.update).toHaveBeenCalledOnce();
  });

  it('does not create a session for a disabled account or unavailable role', async () => {
    const transaction = {
      authSession: { create: vi.fn() },
      userRole: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    const { service } = createService(transaction);

    await expect(service.create('user-1', 'role-1')).rejects.toBeInstanceOf(
      AuthSessionInvalidError,
    );
    expect(transaction.authSession.create).not.toHaveBeenCalled();
  });

  it('rotates the refresh token with an optimistic single-use update', async () => {
    const now = new Date('2026-07-22T04:00:00.000Z');
    const expiresAt = new Date('2026-07-22T05:00:00.000Z');
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const transaction = {
      authSession: {
        findUnique: vi.fn().mockResolvedValue({
          expiresAt,
          id: 'session-1',
          roleAssignment: { ...activeRole, revokedAt: null },
          rowVersion: 3,
          user: { id: 'user-1', status: 'ACTIVE' },
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const { generate, service } = createService(transaction);
    generate.mockReset().mockReturnValue('refresh-next');

    const result = await service.refresh('refresh-current');

    expect(result.refreshToken).toBe('refresh-next');
    expect(result.refreshTokenExpiresAt).toBe(expiresAt);
    expect(transaction.authSession.updateMany).toHaveBeenCalledWith({
      data: {
        lastSeenAt: now,
        refreshTokenHash: 'hash:refresh-next',
        rowVersion: { increment: 1 },
      },
      where: {
        expiresAt: { gt: now },
        id: 'session-1',
        refreshTokenHash: 'hash:refresh-current',
        revokedAt: null,
        rowVersion: 3,
      },
    });
  });

  it('rejects a refresh token that lost a concurrent rotation race', async () => {
    const transaction = {
      authSession: {
        findUnique: vi.fn().mockResolvedValue({
          expiresAt: new Date(Date.now() + 60_000),
          id: 'session-1',
          roleAssignment: { ...activeRole, revokedAt: null },
          rowVersion: 3,
          user: { id: 'user-1', status: 'ACTIVE' },
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const { issue, service } = createService(transaction);

    await expect(service.refresh('refresh-current')).rejects.toBeInstanceOf(
      AuthSessionInvalidError,
    );
    expect(issue).not.toHaveBeenCalled();
  });

  it('revalidates the account, selected role and session for every access token', async () => {
    const now = new Date('2026-07-22T04:00:00.000Z');
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const claims = {
      expiresAt: new Date(Date.now() + 60_000),
      roleAssignmentId: 'role-1',
      roleCode: 'HOST',
      sessionId: 'session-1',
      siteId: null,
      userId: 'user-1',
    } as const;
    const readClient = {
      authSession: { findFirst: vi.fn().mockResolvedValue({ id: 'session-1' }) },
    };
    const { service, verify } = createService({}, readClient);
    verify.mockResolvedValue(claims);

    await expect(service.authenticate('access-token')).resolves.toBe(claims);
    expect(readClient.authSession.findFirst).toHaveBeenCalledWith({
      select: { id: true },
      where: {
        expiresAt: { gt: now },
        id: 'session-1',
        revokedAt: null,
        roleAssignment: {
          id: 'role-1',
          revokedAt: null,
          roleCode: 'HOST',
          siteId: null,
        },
        roleAssignmentId: 'role-1',
        user: { status: 'ACTIVE' },
        userId: 'user-1',
      },
    });
  });

  it('revokes one session or all user sessions without deleting history', async () => {
    const now = new Date('2026-07-22T04:00:00.000Z');
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const updateMany = vi
      .fn()
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 2 });
    const { service } = createService({}, { authSession: { updateMany } });

    await service.revoke('user-1', 'session-1');
    await expect(service.revokeAll('user-1')).resolves.toBe(2);

    expect(updateMany).toHaveBeenNthCalledWith(1, {
      data: {
        revokeReason: 'USER_LOGOUT',
        revokedAt: now,
        rowVersion: { increment: 1 },
      },
      where: { id: 'session-1', revokedAt: null, userId: 'user-1' },
    });
    expect(updateMany).toHaveBeenNthCalledWith(2, {
      data: {
        revokeReason: 'ALL_SESSIONS_REVOKED',
        revokedAt: now,
        rowVersion: { increment: 1 },
      },
      where: { revokedAt: null, userId: 'user-1' },
    });
  });
});
