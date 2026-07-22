import type { DatabaseClient, Prisma } from '@makeup/database';
import { describe, expect, it, vi } from 'vitest';

import { AuditCommandService } from '../audit/audit-command.service';
import { AuditEntryFactory } from '../audit/audit-entry.factory';
import { AuditSnapshotSanitizerService } from '../audit/audit-snapshot-sanitizer.service';
import {
  AuthorizationDeniedError,
  AuthorizationPolicyService,
} from '../auth/authorization-policy.service';
import type { DatabaseService } from '../database/database.service';
import { ArtistShiftService } from './artist-shift.service';
import { InitialShiftAlreadyConfiguredError, ShiftArtistUnavailableError } from './shift.errors';
import { ShiftDefinitionInvalidError } from './shift-time';
import type { ShiftCommandContext } from './shift.types';

const customerServiceContext: ShiftCommandContext = {
  actorName: '松江客服',
  clientType: 'ADMIN_WEB',
  roleAssignmentId: 'role-customer-service',
  roleCode: 'CUSTOMER_SERVICE',
  siteId: 'site-songjiang',
  userId: 'user-customer-service',
};

const definition = {
  artistId: 'artist-1',
  breakEndMinute: 780,
  breakStartMinute: 720,
  workEndMinute: 1080,
  workStartMinute: 540,
  workdays: [5, 1, 3],
} as const;

const artist = {
  employmentStatus: 'ACTIVE',
  id: 'artist-1',
  initialShiftConfiguredAt: null,
  nickname: '柔柔',
  siteId: 'site-songjiang',
  userId: 'user-artist',
};

const shiftRecord = {
  artistId: 'artist-1',
  breakEndMinute: 780,
  breakStartMinute: 720,
  id: 'shift-1',
  validFrom: new Date('2026-07-23T00:00:00.000Z'),
  validUntil: null,
  versionNo: 1,
  workEndMinute: 1080,
  workStartMinute: 540,
  workdays: [1, 3, 5],
};

function createService(transaction: object, readClient: object = transaction) {
  const append = vi.fn().mockResolvedValue('log-1');
  const database = {
    read: vi.fn((operation: (value: DatabaseClient) => unknown) =>
      operation(readClient as DatabaseClient),
    ),
    transaction: vi.fn((operation: (value: Prisma.TransactionClient) => unknown) =>
      operation(transaction as Prisma.TransactionClient),
    ),
  };
  const service = new ArtistShiftService(
    new AuditCommandService(new AuditEntryFactory(new AuditSnapshotSanitizerService()), {
      append,
    }),
    new AuthorizationPolicyService(),
    database as unknown as DatabaseService,
  );

  return { append, database, service };
}

function successfulTransaction(overrides: Partial<typeof artist> = {}) {
  return {
    artistProfile: {
      findUnique: vi.fn().mockResolvedValue({ ...artist, ...overrides }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    artistShiftTemplate: { create: vi.fn().mockResolvedValue(shiftRecord) },
  };
}

describe('ArtistShiftService', () => {
  it('sets an artist own initial shift and audits the atomic change', async () => {
    const now = new Date('2026-07-22T16:30:00.000Z');
    const transaction = successfulTransaction();
    const { append, service } = createService(transaction);
    const context = {
      ...customerServiceContext,
      actorName: '柔柔',
      roleCode: 'ARTIST',
      siteId: null,
      userId: 'user-artist',
    } as const;

    await expect(service.setInitialShift(context, definition, now)).resolves.toEqual({
      ...shiftRecord,
      siteId: 'site-songjiang',
      validFrom: '2026-07-23',
      validUntil: null,
    });
    expect(transaction.artistProfile.updateMany).toHaveBeenCalledWith({
      data: { initialShiftConfiguredAt: now, rowVersion: { increment: 1 } },
      where: {
        employmentStatus: 'ACTIVE',
        id: 'artist-1',
        initialShiftConfiguredAt: null,
      },
    });
    const createCall: unknown = transaction.artistShiftTemplate.create.mock.calls[0]?.[0];
    expect(createCall).toMatchObject({
      data: {
        createdByUserId: 'user-artist',
        validFrom: new Date('2026-07-23T00:00:00.000Z'),
        versionNo: 1,
        workdays: [1, 3, 5],
      },
    });
    expect(append).toHaveBeenCalledWith(
      transaction,
      expect.objectContaining({
        action: 'ARTIST_INITIAL_SHIFT_CONFIGURED',
        actorRole: 'ARTIST',
        objectId: 'shift-1',
        siteId: 'site-songjiang',
      }),
    );
  });

  it('rejects invalid time input before opening a transaction', () => {
    const { database, service } = createService({});

    expect(() =>
      service.setInitialShift(customerServiceContext, {
        ...definition,
        workStartMinute: 545,
      }),
    ).toThrow(ShiftDefinitionInvalidError);
    expect(database.transaction).not.toHaveBeenCalled();
  });

  it('rejects a customer-service cross-site artist before claiming configuration', async () => {
    const transaction = successfulTransaction({ siteId: 'site-wuxi' });
    const { service } = createService(transaction);

    await expect(
      service.setInitialShift(customerServiceContext, definition),
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
    expect(transaction.artistProfile.updateMany).not.toHaveBeenCalled();
  });

  it('allows an administrator to configure an artist in any site', async () => {
    const transaction = successfulTransaction({ siteId: 'site-wuxi' });
    const { service } = createService(transaction);
    const context = { ...customerServiceContext, roleCode: 'ADMIN', siteId: null } as const;

    await expect(service.setInitialShift(context, definition)).resolves.toMatchObject({
      id: 'shift-1',
      siteId: 'site-wuxi',
    });
  });

  it('rejects inactive artists and concurrent duplicate first settings', async () => {
    const inactive = successfulTransaction({ employmentStatus: 'INACTIVE' });
    const duplicate = successfulTransaction();
    duplicate.artistProfile.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      createService(inactive).service.setInitialShift(customerServiceContext, definition),
    ).rejects.toBeInstanceOf(ShiftArtistUnavailableError);
    await expect(
      createService(duplicate).service.setInitialShift(customerServiceContext, definition),
    ).rejects.toBeInstanceOf(InitialShiftAlreadyConfiguredError);
    expect(duplicate.artistShiftTemplate.create).not.toHaveBeenCalled();
  });

  it('returns the shift active on the Shanghai business date', async () => {
    const findFirst = vi.fn().mockResolvedValue(shiftRecord);
    const { service } = createService(
      {},
      {
        artistProfile: { findUnique: vi.fn().mockResolvedValue(artist) },
        artistShiftTemplate: { findFirst },
      },
    );

    await expect(
      service.getCurrentShift(customerServiceContext, 'artist-1', new Date('2026-07-23T04:00:00Z')),
    ).resolves.toMatchObject({ id: 'shift-1', validFrom: '2026-07-23' });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          artistId: 'artist-1',
          OR: [{ validUntil: null }, { validUntil: { gt: new Date('2026-07-23T00:00:00Z') } }],
          validFrom: { lte: new Date('2026-07-23T00:00:00Z') },
        },
      }),
    );
  });

  it('denies full shift details to unrelated roles', async () => {
    const { service } = createService(
      {},
      { artistProfile: { findUnique: vi.fn().mockResolvedValue(artist) } },
    );
    const context = { ...customerServiceContext, roleCode: 'OPERATOR', siteId: null } as const;

    await expect(service.getCurrentShift(context, 'artist-1')).rejects.toBeInstanceOf(
      AuthorizationDeniedError,
    );
  });
});
