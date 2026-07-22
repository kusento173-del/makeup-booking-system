import type { Prisma } from '@makeup/database';
import { describe, expect, it, vi } from 'vitest';

import { AuditCommandService } from '../audit/audit-command.service';
import { AuditEntryFactory } from '../audit/audit-entry.factory';
import { AuditSnapshotSanitizerService } from '../audit/audit-snapshot-sanitizer.service';
import {
  AuthorizationDeniedError,
  AuthorizationPolicyService,
} from '../auth/authorization-policy.service';
import type { DatabaseService } from '../database/database.service';
import { ShiftChangeService } from './shift-change.service';
import {
  ShiftChangeEffectiveDateError,
  ShiftChangeNoOpError,
  ShiftChangeStateConflictError,
} from './shift.errors';
import type { ShiftCommandContext } from './shift.types';

const now = new Date('2026-07-22T04:00:00.000Z');
const artistContext: ShiftCommandContext = {
  actorName: '柔柔',
  roleAssignmentId: 'role-artist',
  roleCode: 'ARTIST',
  siteId: null,
  userId: 'user-artist',
};
const customerServiceContext: ShiftCommandContext = {
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
const currentShift = {
  artistId: 'artist-1',
  breakEndMinute: 780,
  breakStartMinute: 720,
  id: 'shift-1',
  validFrom: new Date('2026-07-01T00:00:00.000Z'),
  validUntil: null,
  versionNo: 1,
  workEndMinute: 1080,
  workStartMinute: 540,
  workdays: [1, 2, 3, 4, 5],
};
const request = {
  artistId: 'artist-1',
  effectiveFrom: new Date('2026-07-24T00:00:00.000Z'),
  id: 'request-1',
  proposedBreakEndMinute: 795,
  proposedBreakStartMinute: 720,
  proposedWorkEndMinute: 1095,
  proposedWorkStartMinute: 540,
  proposedWorkdays: [1, 2, 3, 4, 5, 6],
  reason: '增加周六班次',
  rowVersion: 1,
  siteId: 'site-songjiang',
  status: 'PENDING',
  submittedAt: new Date('2026-07-22T04:00:00.000Z'),
};
const reviewRequest = {
  ...request,
  affectedAppointmentCount: 0,
  artist: { employmentStatus: 'ACTIVE', siteId: 'site-songjiang' },
  currentShift,
  submittedByUserId: 'user-artist',
};

function createService(transaction: object) {
  const append = vi.fn().mockResolvedValue('log-1');
  const database = {
    transaction: vi.fn((operation: (value: Prisma.TransactionClient) => unknown) =>
      operation(transaction as Prisma.TransactionClient),
    ),
  };
  const service = new ShiftChangeService(
    new AuditCommandService(new AuditEntryFactory(new AuditSnapshotSanitizerService()), {
      append,
    }),
    new AuthorizationPolicyService(),
    database as unknown as DatabaseService,
  );
  return { append, database, service };
}

const submitCommand = {
  artistId: 'artist-1',
  breakEndMinute: 795,
  breakStartMinute: 720,
  effectiveFrom: new Date('2026-07-24T00:00:00.000Z'),
  reason: ' 增加周六班次 ',
  workEndMinute: 1095,
  workStartMinute: 540,
  workdays: [6, 5, 4, 3, 2, 1],
} as const;

describe('ShiftChangeService', () => {
  it('submits an artist own future change while preserving the current shift', async () => {
    const create = vi.fn().mockResolvedValue(request);
    const transaction = {
      artistProfile: { findUnique: vi.fn().mockResolvedValue(artist) },
      artistShiftChangeRequest: { create },
      artistShiftTemplate: { findFirst: vi.fn().mockResolvedValue(currentShift) },
    };
    const { append, service } = createService(transaction);

    await expect(service.submit(artistContext, submitCommand, now)).resolves.toMatchObject({
      effectiveFrom: '2026-07-24',
      id: 'request-1',
      reason: '增加周六班次',
      status: 'PENDING',
    });
    const createRequestCall: unknown = create.mock.calls[0]?.[0];
    expect(createRequestCall).toMatchObject({
      data: {
        currentShiftId: 'shift-1',
        proposedWorkdays: [1, 2, 3, 4, 5, 6],
        reason: '增加周六班次',
        siteId: 'site-songjiang',
      },
    });
    expect(append).toHaveBeenCalledWith(
      transaction,
      expect.objectContaining({
        action: 'ARTIST_SHIFT_CHANGE_SUBMITTED',
        actorRole: 'ARTIST',
        objectId: 'request-1',
      }),
    );
  });

  it('rejects same-day, cross-person and no-op submissions', async () => {
    const transaction = {
      artistProfile: { findUnique: vi.fn().mockResolvedValue(artist) },
      artistShiftChangeRequest: { create: vi.fn() },
      artistShiftTemplate: { findFirst: vi.fn().mockResolvedValue(currentShift) },
    };
    const { database, service } = createService(transaction);

    expect(() =>
      service.submit(
        artistContext,
        { ...submitCommand, effectiveFrom: new Date('2026-07-22T00:00:00.000Z') },
        now,
      ),
    ).toThrow(ShiftChangeEffectiveDateError);
    expect(database.transaction).not.toHaveBeenCalled();

    transaction.artistProfile.findUnique.mockResolvedValue({ ...artist, userId: 'other-user' });
    await expect(service.submit(artistContext, submitCommand, now)).rejects.toBeInstanceOf(
      AuthorizationDeniedError,
    );

    transaction.artistProfile.findUnique.mockResolvedValue(artist);
    await expect(
      service.submit(
        artistContext,
        {
          ...submitCommand,
          breakEndMinute: currentShift.breakEndMinute,
          breakStartMinute: currentShift.breakStartMinute,
          workEndMinute: currentShift.workEndMinute,
          workStartMinute: currentShift.workStartMinute,
          workdays: currentShift.workdays,
        },
        now,
      ),
    ).rejects.toBeInstanceOf(ShiftChangeNoOpError);
    expect(transaction.artistShiftChangeRequest.create).not.toHaveBeenCalled();
  });

  it('withdraws only the submitting artist pending request with optimistic concurrency', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const transaction = {
      artistProfile: { findUnique: vi.fn().mockResolvedValue({ userId: 'user-artist' }) },
      artistShiftChangeRequest: {
        findUnique: vi.fn().mockResolvedValue(request),
        updateMany,
      },
    };
    const { append, service } = createService(transaction);

    await expect(
      service.withdraw(artistContext, { expectedRowVersion: 1, requestId: 'request-1' }),
    ).resolves.toBeUndefined();
    expect(updateMany).toHaveBeenCalledWith({
      data: { rowVersion: { increment: 1 }, status: 'WITHDRAWN' },
      where: { id: 'request-1', rowVersion: 1, status: 'PENDING' },
    });
    expect(append).toHaveBeenCalledWith(
      transaction,
      expect.objectContaining({ action: 'ARTIST_SHIFT_CHANGE_WITHDRAWN' }),
    );
  });

  it('approves once, closes the old version and creates the next immutable version', async () => {
    const finishReview = vi.fn().mockResolvedValue({ count: 1 });
    const closeCurrent = vi.fn().mockResolvedValue({ count: 1 });
    const createShift = vi.fn().mockResolvedValue({
      ...currentShift,
      breakEndMinute: 795,
      id: 'shift-2',
      validFrom: request.effectiveFrom,
      versionNo: 2,
      workEndMinute: 1095,
      workdays: request.proposedWorkdays,
    });
    const transaction = {
      artistShiftChangeRequest: {
        findUnique: vi.fn().mockResolvedValue(reviewRequest),
        updateMany: finishReview,
      },
      artistShiftTemplate: { create: createShift, updateMany: closeCurrent },
    };
    const { append, service } = createService(transaction);

    await expect(
      service.review(
        customerServiceContext,
        {
          comment: ' 同意 ',
          decision: 'APPROVE',
          expectedRowVersion: 1,
          requestId: 'request-1',
        },
        now,
      ),
    ).resolves.toMatchObject({ id: 'shift-2', validFrom: '2026-07-24', versionNo: 2 });
    const reviewCall: unknown = finishReview.mock.calls[0]?.[0];
    expect(reviewCall).toMatchObject({
      data: { status: 'APPROVED' },
      where: { id: 'request-1', rowVersion: 1, status: 'PENDING' },
    });
    expect(closeCurrent).toHaveBeenCalledWith({
      data: { validUntil: request.effectiveFrom },
      where: { id: 'shift-1', validUntil: null },
    });
    const createShiftCall: unknown = createShift.mock.calls[0]?.[0];
    expect(createShiftCall).toMatchObject({
      data: {
        sourceRequestId: 'request-1',
        validFrom: request.effectiveFrom,
        versionNo: 2,
      },
    });
    expect(append).toHaveBeenCalledTimes(2);
  });

  it('rejects without changing the shift version', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const transaction = {
      artistShiftChangeRequest: {
        findUnique: vi.fn().mockResolvedValue(reviewRequest),
        updateMany,
      },
      artistShiftTemplate: { create: vi.fn(), updateMany: vi.fn() },
    };
    const { service } = createService(transaction);

    await expect(
      service.review(
        customerServiceContext,
        { decision: 'REJECT', expectedRowVersion: 1, requestId: 'request-1' },
        now,
      ),
    ).resolves.toBeNull();
    expect(transaction.artistShiftTemplate.updateMany).not.toHaveBeenCalled();
    expect(transaction.artistShiftTemplate.create).not.toHaveBeenCalled();
  });

  it('prevents cross-site, self and concurrent review', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    const transaction = {
      artistShiftChangeRequest: {
        findUnique: vi.fn().mockResolvedValue(reviewRequest),
        updateMany,
      },
      artistShiftTemplate: { create: vi.fn(), updateMany: vi.fn() },
    };
    const { service } = createService(transaction);

    await expect(
      service.review(
        { ...customerServiceContext, siteId: 'site-wuxi' },
        { decision: 'REJECT', expectedRowVersion: 1, requestId: 'request-1' },
        now,
      ),
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
    await expect(
      service.review(
        { ...customerServiceContext, userId: 'user-artist' },
        { decision: 'REJECT', expectedRowVersion: 1, requestId: 'request-1' },
        now,
      ),
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
    await expect(
      service.review(
        customerServiceContext,
        { decision: 'REJECT', expectedRowVersion: 1, requestId: 'request-1' },
        now,
      ),
    ).rejects.toBeInstanceOf(ShiftChangeStateConflictError);
  });
});
