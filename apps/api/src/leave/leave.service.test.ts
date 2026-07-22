import type { DatabaseClient, Prisma } from '@makeup/database';
import { describe, expect, it, vi } from 'vitest';

import { AuditCommandService } from '../audit/audit-command.service';
import { AuditEntryFactory } from '../audit/audit-entry.factory';
import { AuditSnapshotSanitizerService } from '../audit/audit-snapshot-sanitizer.service';
import { AuthorizationDeniedError } from '../auth/authorization-policy.service';
import type { DatabaseService } from '../database/database.service';
import {
  LeaveDateRangeInvalidError,
  LeaveImpactChangedError,
  LeaveReasonInvalidError,
  LeaveStateConflictError,
} from './leave.errors';
import { LeaveService } from './leave.service';
import type { LeaveCommandContext } from './leave.types';

const now = new Date('2026-07-22T04:00:00.000Z');
const range = {
  endDate: new Date('2026-07-29T00:00:00.000Z'),
  startDate: new Date('2026-07-23T00:00:00.000Z'),
};
const context: LeaveCommandContext = {
  actorName: '主播一',
  roleAssignmentId: 'role-1',
  roleCode: 'HOST',
  siteId: null,
  userId: 'user-host',
};
const host = { id: 'host-1', qualificationStatus: 'ACTIVE', siteId: 'site-songjiang' };

function createService(client: object) {
  const append = vi.fn().mockResolvedValue('log-1');
  const database = {
    read: vi.fn((operation: (value: DatabaseClient) => unknown) =>
      operation(client as DatabaseClient),
    ),
    transaction: vi.fn((operation: (value: Prisma.TransactionClient) => unknown) =>
      operation(client as Prisma.TransactionClient),
    ),
  };
  return {
    append,
    database,
    service: new LeaveService(
      new AuditCommandService(new AuditEntryFactory(new AuditSnapshotSanitizerService()), {
        append,
      }),
      database as unknown as DatabaseService,
    ),
  };
}

describe('LeaveService', () => {
  it('previews the bound host future seven-day leave with zero placeholder impact', async () => {
    const { service } = createService({
      hostProfile: { findUnique: vi.fn().mockResolvedValue(host) },
    });

    await expect(service.preview(context, range, now)).resolves.toEqual({
      affectedAppointmentCount: 0,
      endDate: '2026-07-29',
      startDate: '2026-07-23',
      subjectId: 'host-1',
      subjectType: 'HOST',
    });
  });

  it('rejects today, dates beyond D+7 and unconfirmed changed impact before persistence', () => {
    const { database, service } = createService({});

    expect(() =>
      service.preview(context, { ...range, startDate: new Date('2026-07-22T00:00:00Z') }, now),
    ).toThrow(LeaveDateRangeInvalidError);
    expect(() =>
      service.preview(context, { ...range, endDate: new Date('2026-07-30T00:00:00Z') }, now),
    ).toThrow(LeaveDateRangeInvalidError);
    expect(() =>
      service.create(context, { ...range, confirmedAffectedAppointmentCount: 1 }, now),
    ).toThrow(LeaveImpactChangedError);
    expect(database.transaction).not.toHaveBeenCalled();
  });

  it('creates leave and audit atomically for the bound active artist', async () => {
    const create = vi.fn().mockResolvedValue({
      affectedAppointmentCount: 0,
      artistId: 'artist-1',
      endDate: range.endDate,
      hostId: null,
      id: 'leave-1',
      reason: '休息',
      rowVersion: 1,
      startDate: range.startDate,
      status: 'ACTIVE',
      subjectType: 'ARTIST',
    });
    const client = {
      artistProfile: {
        findUnique: vi.fn().mockResolvedValue({
          employmentStatus: 'ACTIVE',
          id: 'artist-1',
          siteId: 'site-songjiang',
        }),
      },
      leaveRecord: { create },
    };
    const { append, service } = createService(client);
    const artistContext = {
      ...context,
      actorName: '柔柔',
      roleCode: 'ARTIST',
      userId: 'user-artist',
    } as const;

    await expect(
      service.create(
        artistContext,
        { ...range, confirmedAffectedAppointmentCount: 0, reason: ' 休息 ' },
        now,
      ),
    ).resolves.toMatchObject({ id: 'leave-1', subjectType: 'ARTIST' });
    const createCall: unknown = create.mock.calls[0]?.[0];
    expect(createCall).toMatchObject({
      data: { artistId: 'artist-1', hostId: null, reason: '休息' },
    });
    expect(append).toHaveBeenCalledWith(
      client,
      expect.objectContaining({ action: 'LEAVE_CREATED', siteId: 'site-songjiang' }),
    );
  });

  it('denies customer service from submitting ordinary leave', async () => {
    const { service } = createService({});
    await expect(
      service.preview(
        { ...context, roleCode: 'CUSTOMER_SERVICE', siteId: 'site-songjiang' },
        range,
        now,
      ),
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
  });

  it('cancels a future self leave with optimistic concurrency and audit', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const client = {
      leaveRecord: {
        findUnique: vi.fn().mockResolvedValue({
          artist: null,
          host: { siteId: 'site-songjiang', userId: 'user-host' },
          id: 'leave-1',
          rowVersion: 1,
          startDate: range.startDate,
          status: 'ACTIVE',
        }),
        updateMany,
      },
    };
    const { append, service } = createService(client);

    await service.cancel(context, { expectedRowVersion: 1, leaveId: 'leave-1' }, now);
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'leave-1', rowVersion: 1, status: 'ACTIVE' } }),
    );
    expect(append).toHaveBeenCalledWith(
      client,
      expect.objectContaining({ action: 'LEAVE_CANCELLED' }),
    );
  });

  it('requires an administrator correction reason and rejects stale or started leave', async () => {
    const client = {
      leaveRecord: {
        findUnique: vi.fn().mockResolvedValue({
          artist: null,
          host: { siteId: 'site-songjiang', userId: 'user-host' },
          id: 'leave-1',
          rowVersion: 1,
          startDate: range.startDate,
          status: 'ACTIVE',
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const { database, service } = createService(client);
    const admin = { ...context, roleCode: 'ADMIN', userId: 'admin-1' } as const;

    expect(() => service.cancel(admin, { expectedRowVersion: 1, leaveId: 'leave-1' }, now)).toThrow(
      LeaveReasonInvalidError,
    );
    expect(database.transaction).not.toHaveBeenCalled();
    await expect(
      service.cancel(admin, { expectedRowVersion: 1, leaveId: 'leave-1', reason: '数据纠错' }, now),
    ).rejects.toBeInstanceOf(LeaveStateConflictError);
    client.leaveRecord.findUnique.mockResolvedValue({
      artist: null,
      host: { siteId: 'site-songjiang', userId: 'user-host' },
      id: 'leave-1',
      rowVersion: 1,
      startDate: new Date('2026-07-22T00:00:00Z'),
      status: 'ACTIVE',
    });
    await expect(
      service.cancel(admin, { expectedRowVersion: 1, leaveId: 'leave-1', reason: '数据纠错' }, now),
    ).rejects.toBeInstanceOf(LeaveDateRangeInvalidError);
  });
});
