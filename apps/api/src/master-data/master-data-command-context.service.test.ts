import type { DatabaseClient } from '@makeup/database';
import { describe, expect, it, vi } from 'vitest';

import { AuthSessionInvalidError } from '../auth/auth-session.errors';
import type { DatabaseService } from '../database/database.service';
import { MasterDataCommandContextService } from './master-data-command-context.service';

const authorization = {
  expiresAt: new Date('2026-07-22T06:00:00.000Z'),
  roleAssignmentId: 'role-1',
  roleCode: 'ADMIN' as const,
  sessionId: 'session-1',
  siteId: null,
  userId: 'user-1',
};

function createService(result: { displayName: string } | null) {
  const findFirst = vi.fn().mockResolvedValue(result);
  const database = {
    read: vi.fn((operation: (client: DatabaseClient) => unknown) =>
      operation({ appUser: { findFirst } } as unknown as DatabaseClient),
    ),
  };

  return {
    findFirst,
    service: new MasterDataCommandContextService(database as unknown as DatabaseService),
  };
}

describe('MasterDataCommandContextService', () => {
  it('derives the audit name from the authenticated database account', async () => {
    const { findFirst, service } = createService({ displayName: '管理员' });

    await expect(
      service.resolve(authorization, { clientType: 'ADMIN_WEB', ipAddress: '127.0.0.1' }),
    ).resolves.toEqual({
      actorName: '管理员',
      ...authorization,
      clientType: 'ADMIN_WEB',
      ipAddress: '127.0.0.1',
    });
    expect(findFirst).toHaveBeenCalledWith({
      select: { displayName: true },
      where: {
        id: 'user-1',
        roles: {
          some: { id: 'role-1', revokedAt: null, roleCode: 'ADMIN', siteId: null },
        },
        status: 'ACTIVE',
      },
    });
  });

  it('rejects a stale authenticated account before a write', async () => {
    const { service } = createService(null);

    await expect(service.resolve(authorization, {})).rejects.toBeInstanceOf(
      AuthSessionInvalidError,
    );
  });
});
