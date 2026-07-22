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
import { ShiftDefinitionInvalidError } from '../shift/shift-time';
import {
  OvertimeDateInvalidError,
  OvertimeShiftNotConfiguredError,
  OvertimeStateConflictError,
  OvertimeWorkingDayError,
} from './overtime.errors';
import { OvertimeService } from './overtime.service';
import type { OvertimeCommandContext } from './overtime.types';

const now = new Date('2026-07-22T04:00:00.000Z');
const overtimeDate = new Date('2026-07-25T00:00:00.000Z');
const artistContext: OvertimeCommandContext = {
  actorName: '柔柔',
  roleAssignmentId: 'role-artist',
  roleCode: 'ARTIST',
  siteId: null,
  userId: 'user-artist',
};
const customerServiceContext: OvertimeCommandContext = {
  actorName: '松江客服',
  roleAssignmentId: 'role-customer-service',
  roleCode: 'CUSTOMER_SERVICE',
  siteId: 'site-songjiang',
  userId: 'user-customer-service',
};
const artist = {
  employmentStatus: 'ACTIVE',
  id: 'artist-1',
  siteId: 'site-songjiang',
  userId: 'user-artist',
};
const shift = { workdays: [1, 2, 3, 4, 5] };
const request = {
  affectedAppointmentCount: 0,
  artistId: 'artist-1',
  breakEndMinute: 780,
  breakStartMinute: 720,
  id: 'overtime-1',
  overtimeDate,
  reason: '周六加班',
  rowVersion: 1,
  siteId: 'site-songjiang',
  status: 'PENDING',
  submittedAt: now,
  workEndMinute: 1080,
  workStartMinute: 540,
};
const reviewRequest = {
  ...request,
  artist,
  submittedByUserId: 'user-artist',
};
const command = {
  artistId: 'artist-1',
  breakEndMinute: 780,
  breakStartMinute: 720,
  overtimeDate,
  reason: ' 周六加班 ',
  workEndMinute: 1080,
  workStartMinute: 540,
} as const;

function createService(transaction: object) {
  const append = vi.fn().mockResolvedValue('log-1');
  const database = {
    read: vi.fn((operation: (value: DatabaseClient) => unknown) =>
      operation(transaction as DatabaseClient),
    ),
    transaction: vi.fn((operation: (value: Prisma.TransactionClient) => unknown) =>
      operation(transaction as Prisma.TransactionClient),
    ),
  };
  const service = new OvertimeService(
    new AuditCommandService(new AuditEntryFactory(new AuditSnapshotSanitizerService()), {
      append,
    }),
    new AuthorizationPolicyService(),
    database as unknown as DatabaseService,
  );
  return { append, database, service };
}

describe('OvertimeService', () => {
  it('lets an artist submit their own non-working-day request atomically', async () => {
    const create = vi.fn().mockResolvedValue(request);
    const transaction = {
      artistOvertime: { create },
      artistProfile: { findUnique: vi.fn().mockResolvedValue(artist) },
      artistShiftTemplate: { findFirst: vi.fn().mockResolvedValue(shift) },
    };
    const { append, service } = createService(transaction);

    await expect(service.submit(artistContext, command, now)).resolves.toMatchObject({
      id: 'overtime-1',
      overtimeDate: '2026-07-25',
      reason: '周六加班',
      status: 'PENDING',
    });
    const createCall: unknown = create.mock.calls[0]?.[0];
    expect(createCall).toMatchObject({
      data: {
        artistId: 'artist-1',
        reason: '周六加班',
        siteId: 'site-songjiang',
        submittedByUserId: 'user-artist',
      },
    });
    expect(append).toHaveBeenCalledWith(
      transaction,
      expect.objectContaining({ action: 'ARTIST_OVERTIME_SUBMITTED' }),
    );
  });

  it('rejects dates outside D+1 to D+7 and invalid time definitions before writing', () => {
    const { database, service } = createService({});

    expect(() =>
      service.submit(
        artistContext,
        { ...command, overtimeDate: new Date('2026-07-30T00:00:00.000Z') },
        now,
      ),
    ).toThrow(OvertimeDateInvalidError);
    expect(() => service.submit(artistContext, { ...command, workStartMinute: 547 }, now)).toThrow(
      ShiftDefinitionInvalidError,
    );
    expect(database.transaction).not.toHaveBeenCalled();
  });

  it('rejects a regular working day and a date without an applicable shift', async () => {
    const transaction = {
      artistOvertime: { create: vi.fn() },
      artistProfile: { findUnique: vi.fn().mockResolvedValue(artist) },
      artistShiftTemplate: { findFirst: vi.fn().mockResolvedValue(shift) },
    };
    const { service } = createService(transaction);

    await expect(
      service.submit(
        artistContext,
        { ...command, overtimeDate: new Date('2026-07-23T00:00:00.000Z') },
        now,
      ),
    ).rejects.toBeInstanceOf(OvertimeWorkingDayError);
    transaction.artistShiftTemplate.findFirst.mockResolvedValue(null);
    await expect(service.submit(artistContext, command, now)).rejects.toBeInstanceOf(
      OvertimeShiftNotConfiguredError,
    );
    expect(transaction.artistOvertime.create).not.toHaveBeenCalled();
  });

  it('prevents an artist from submitting for another artist', async () => {
    const transaction = {
      artistOvertime: { create: vi.fn() },
      artistProfile: {
        findUnique: vi.fn().mockResolvedValue({ ...artist, userId: 'other-user' }),
      },
      artistShiftTemplate: { findFirst: vi.fn() },
    };
    const { service } = createService(transaction);

    await expect(service.submit(artistContext, command, now)).rejects.toBeInstanceOf(
      AuthorizationDeniedError,
    );
    expect(transaction.artistShiftTemplate.findFirst).not.toHaveBeenCalled();
  });

  it('withdraws only the owning artist pending request with optimistic concurrency', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const transaction = {
      artistOvertime: {
        findUnique: vi.fn().mockResolvedValue(reviewRequest),
        updateMany,
      },
    };
    const { append, service } = createService(transaction);

    await expect(
      service.withdraw(artistContext, { expectedRowVersion: 1, overtimeId: 'overtime-1' }),
    ).resolves.toBeUndefined();
    expect(updateMany).toHaveBeenCalledWith({
      data: { rowVersion: { increment: 1 }, status: 'WITHDRAWN' },
      where: { id: 'overtime-1', rowVersion: 1, status: 'PENDING' },
    });
    expect(append).toHaveBeenCalledWith(
      transaction,
      expect.objectContaining({ action: 'ARTIST_OVERTIME_WITHDRAWN' }),
    );
  });

  it('approves a site request once without changing the weekly shift', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const transaction = {
      artistOvertime: {
        findUnique: vi.fn().mockResolvedValue(reviewRequest),
        updateMany,
      },
      artistShiftTemplate: { findFirst: vi.fn().mockResolvedValue(shift) },
    };
    const { append, service } = createService(transaction);

    await expect(
      service.review(
        customerServiceContext,
        {
          comment: ' 同意 ',
          decision: 'APPROVE',
          expectedRowVersion: 1,
          overtimeId: 'overtime-1',
        },
        now,
      ),
    ).resolves.toMatchObject({ rowVersion: 2, status: 'APPROVED' });
    const updateCall: unknown = updateMany.mock.calls[0]?.[0];
    expect(updateCall).toMatchObject({
      data: { status: 'APPROVED' },
      where: { id: 'overtime-1', rowVersion: 1, status: 'PENDING' },
    });
    expect(append).toHaveBeenCalledWith(
      transaction,
      expect.objectContaining({ action: 'ARTIST_OVERTIME_APPROVED', reason: '同意' }),
    );
  });

  it('rejects without checking or opening the requested date', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const transaction = {
      artistOvertime: {
        findUnique: vi.fn().mockResolvedValue(reviewRequest),
        updateMany,
      },
      artistShiftTemplate: { findFirst: vi.fn() },
    };
    const { service } = createService(transaction);

    await expect(
      service.review(
        customerServiceContext,
        { decision: 'REJECT', expectedRowVersion: 1, overtimeId: 'overtime-1' },
        now,
      ),
    ).resolves.toMatchObject({ status: 'REJECTED' });
    expect(transaction.artistShiftTemplate.findFirst).not.toHaveBeenCalled();
  });

  it('prevents cross-site, self and concurrent review', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    const transaction = {
      artistOvertime: {
        findUnique: vi.fn().mockResolvedValue(reviewRequest),
        updateMany,
      },
      artistShiftTemplate: { findFirst: vi.fn().mockResolvedValue(shift) },
    };
    const { service } = createService(transaction);

    await expect(
      service.review(
        { ...customerServiceContext, siteId: 'site-wuxi' },
        { decision: 'REJECT', expectedRowVersion: 1, overtimeId: 'overtime-1' },
        now,
      ),
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
    await expect(
      service.review(
        { ...customerServiceContext, userId: 'user-artist' },
        { decision: 'REJECT', expectedRowVersion: 1, overtimeId: 'overtime-1' },
        now,
      ),
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
    await expect(
      service.review(
        customerServiceContext,
        { decision: 'APPROVE', expectedRowVersion: 1, overtimeId: 'overtime-1' },
        now,
      ),
    ).rejects.toBeInstanceOf(OvertimeStateConflictError);
  });

  it('lets customer service directly add approved overtime for its site', async () => {
    const create = vi.fn().mockResolvedValue({ ...request, status: 'APPROVED' });
    const transaction = {
      artistOvertime: { create },
      artistProfile: { findUnique: vi.fn().mockResolvedValue(artist) },
      artistShiftTemplate: { findFirst: vi.fn().mockResolvedValue(shift) },
    };
    const { append, service } = createService(transaction);

    await expect(
      service.directApprove(customerServiceContext, command, now),
    ).resolves.toMatchObject({ status: 'APPROVED' });
    const createCall: unknown = create.mock.calls[0]?.[0];
    expect(createCall).toMatchObject({
      data: {
        reviewedAt: now,
        reviewedByUserId: 'user-customer-service',
        status: 'APPROVED',
      },
    });
    expect(append).toHaveBeenCalledWith(
      transaction,
      expect.objectContaining({ action: 'ARTIST_OVERTIME_DIRECTLY_APPROVED' }),
    );
  });
});
