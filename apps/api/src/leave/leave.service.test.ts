import type { DatabaseClient, Prisma } from '@makeup/database';
import { describe, expect, it, vi } from 'vitest';

import { AuditCommandService } from '../audit/audit-command.service';
import { AuditEntryFactory } from '../audit/audit-entry.factory';
import { AuditSnapshotSanitizerService } from '../audit/audit-snapshot-sanitizer.service';
import { AuthorizationDeniedError } from '../auth/authorization-policy.service';
import type { DatabaseService } from '../database/database.service';
import {
  LeaveDateRangeInvalidError,
  LeaveFixedAppointmentRestoreConflictError,
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
const affectedAppointment = (id: string) => ({
  appointmentDate: range.startDate,
  appointmentType: 'SINGLE',
  endAt: new Date('2026-07-23T01:30:00.000Z'),
  hostCodeSnapshot: '000001',
  hostId: 'host-1',
  hostNameSnapshot: '主播一',
  id,
  startAt: new Date('2026-07-23T01:00:00.000Z'),
});

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
  it('previews the bound host future seven-day leave with current appointment impact', async () => {
    const { service } = createService({
      appointment: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            affectedAppointment('appointment-1'),
            affectedAppointment('appointment-2'),
          ]),
      },
      hostProfile: { findUnique: vi.fn().mockResolvedValue(host) },
    });

    await expect(service.preview(context, range, now)).resolves.toMatchObject({
      affectedAppointmentCount: 2,
      endDate: '2026-07-29',
      startDate: '2026-07-23',
      subjectId: 'host-1',
      subjectType: 'HOST',
    });
  });

  it('rejects today and dates beyond D+7 before persistence', () => {
    const { database, service } = createService({});

    expect(() =>
      service.preview(context, { ...range, startDate: new Date('2026-07-22T00:00:00Z') }, now),
    ).toThrow(LeaveDateRangeInvalidError);
    expect(() =>
      service.preview(context, { ...range, endDate: new Date('2026-07-30T00:00:00Z') }, now),
    ).toThrow(LeaveDateRangeInvalidError);
    expect(database.transaction).not.toHaveBeenCalled();
  });

  it('submits artist leave for approval without cancelling appointments', async () => {
    const create = vi.fn().mockResolvedValue({
      affectedAppointmentCount: 0,
      artistId: 'artist-1',
      endDate: range.endDate,
      hostId: null,
      id: 'leave-1',
      reason: '休息',
      rowVersion: 1,
      startDate: range.startDate,
      reviewComment: null,
      status: 'PENDING',
      subjectType: 'ARTIST',
    });
    const client = {
      $queryRaw: vi.fn().mockResolvedValue([{ acquired: 1 }]),
      appointment: {
        findMany: vi.fn().mockResolvedValue([affectedAppointment('appointment-1')]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
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
        { ...range, confirmedAffectedAppointmentCount: 1, reason: ' 休息 ' },
        now,
      ),
    ).resolves.toMatchObject({ id: 'leave-1', subjectType: 'ARTIST' });
    const createCall: unknown = create.mock.calls[0]?.[0];
    expect(createCall).toMatchObject({
      data: {
        affectedAppointmentCount: 1,
        artistId: 'artist-1',
        hostId: null,
        reason: '休息',
      },
    });
    expect(client.appointment.updateMany).not.toHaveBeenCalled();
    expect(append).toHaveBeenCalledWith(
      client,
      expect.objectContaining({ action: 'ARTIST_LEAVE_SUBMITTED', siteId: 'site-songjiang' }),
    );
  });

  it('rolls back when appointment impact differs from the confirmed preview', async () => {
    const client = {
      $queryRaw: vi.fn().mockResolvedValue([{ acquired: 1 }]),
      appointment: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            affectedAppointment('appointment-1'),
            affectedAppointment('appointment-2'),
          ]),
      },
      hostProfile: { findUnique: vi.fn().mockResolvedValue(host) },
      leaveRecord: { create: vi.fn() },
    };
    const { service } = createService(client);

    await expect(
      service.create(context, { ...range, confirmedAffectedAppointmentCount: 1 }, now),
    ).rejects.toBeInstanceOf(LeaveImpactChangedError);
    expect(client.leaveRecord.create).not.toHaveBeenCalled();
  });

  it('lists current and future active leave for the signed-in subject', async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        affectedAppointmentCount: 1,
        artistId: null,
        endDate: range.endDate,
        hostId: 'host-1',
        id: 'leave-1',
        reason: null,
        reviewComment: null,
        rowVersion: 1,
        startDate: range.startDate,
        status: 'ACTIVE',
        subjectType: 'HOST',
      },
    ]);
    const { service } = createService({
      appointment: { findMany: vi.fn().mockResolvedValue([affectedAppointment('appointment-1')]) },
      hostProfile: { findUnique: vi.fn().mockResolvedValue(host) },
      leaveRecord: { findMany },
    });

    await expect(service.listSelf(context, now)).resolves.toMatchObject([{ id: 'leave-1' }]);
    const listCall: unknown = findMany.mock.calls[0]?.[0];
    expect(listCall).toMatchObject({
      where: {
        hostId: 'host-1',
        status: { in: ['ACTIVE', 'CANCELLED', 'PENDING', 'REJECTED'] },
      },
    });
  });

  it('approves artist leave and cancels the confirmed fixed and single appointments', async () => {
    const appointmentUpdate = vi.fn().mockResolvedValue({ count: 1 });
    const leaveUpdate = vi.fn().mockResolvedValue({ count: 1 });
    const client = {
      $queryRaw: vi.fn().mockResolvedValue([{ acquired: 1 }]),
      appointment: {
        findMany: vi.fn().mockResolvedValue([affectedAppointment('appointment-1')]),
        updateMany: appointmentUpdate,
      },
      leaveRecord: {
        findUnique: vi.fn().mockResolvedValue({
          affectedAppointmentCount: 1,
          artist: { id: 'artist-1', siteId: 'site-songjiang' },
          artistId: 'artist-1',
          endDate: range.endDate,
          hostId: null,
          id: 'leave-1',
          reason: '休息',
          reviewComment: null,
          rowVersion: 1,
          startDate: range.startDate,
          status: 'PENDING',
          subjectType: 'ARTIST',
        }),
        updateMany: leaveUpdate,
      },
    };
    const { service } = createService(client);
    const customerService = {
      ...context,
      actorName: '松江客服',
      roleCode: 'CUSTOMER_SERVICE',
      siteId: 'site-songjiang',
      userId: 'user-service',
    } as const;

    await expect(
      service.review(
        customerService,
        {
          confirmedAffectedAppointmentCount: 1,
          decision: 'APPROVE',
          expectedRowVersion: 1,
          leaveId: 'leave-1',
        },
        now,
      ),
    ).resolves.toMatchObject({ status: 'ACTIVE' });
    const leaveUpdateCall: unknown = leaveUpdate.mock.calls[0]?.[0];
    expect(leaveUpdateCall).toMatchObject({
      data: { status: 'ACTIVE' },
      where: { id: 'leave-1', rowVersion: 1, status: 'PENDING' },
    });
    const appointmentUpdateCall: unknown = appointmentUpdate.mock.calls[0]?.[0];
    expect(appointmentUpdateCall).toMatchObject({
      data: {
        cancellationReasonCode: 'ARTIST_LEAVE',
        cancellationSourceId: 'leave-1',
        status: 'CANCELLED',
      },
    });
  });

  it('lists pending leave with the current affected appointments instead of the submitted count', async () => {
    const client = {
      appointment: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            affectedAppointment('appointment-1'),
            affectedAppointment('appointment-2'),
          ]),
      },
      leaveRecord: {
        findMany: vi.fn().mockResolvedValue([
          {
            affectedAppointmentCount: 1,
            artist: { nickname: '柔柔', siteId: 'site-songjiang' },
            artistId: 'artist-1',
            createdAt: now,
            endDate: range.endDate,
            hostId: null,
            id: 'leave-1',
            reason: '休息',
            reviewComment: null,
            rowVersion: 1,
            startDate: range.startDate,
            status: 'PENDING',
            subjectType: 'ARTIST',
          },
        ]),
      },
    };
    const { service } = createService(client);

    await expect(
      service.listPending(
        {
          ...context,
          actorName: '松江客服',
          roleCode: 'CUSTOMER_SERVICE',
          siteId: 'site-songjiang',
          userId: 'user-service',
        },
        now,
      ),
    ).resolves.toMatchObject([
      {
        affectedAppointmentCount: 2,
        affectedAppointments: [{ id: 'appointment-1' }, { id: 'appointment-2' }],
      },
    ]);
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
      appointment: { findMany: vi.fn().mockResolvedValue([]) },
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
    expect(client.appointment.findMany).not.toHaveBeenCalled();
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'leave-1',
          rowVersion: 1,
          status: { in: ['ACTIVE', 'PENDING'] },
        },
      }),
    );
    expect(append).toHaveBeenCalledWith(
      client,
      expect.objectContaining({ action: 'LEAVE_CANCELLED' }),
    );
  });

  it('restores fixed appointments cancelled by the leave while keeping single appointments cancelled', async () => {
    const fixedAppointment = {
      appointmentDate: range.startDate,
      artistId: 'artist-1',
      dailySequence: 1,
      endAt: new Date('2026-07-23T09:30:00.000Z'),
      fixedRule: {
        durationMinutes: 30,
        startMinute: 1020,
        status: 'ACTIVE',
        validFrom: new Date('2026-07-01T00:00:00.000Z'),
        validUntil: null,
        weekdays: [{ isoWeekday: 4 }],
      },
      hostId: 'host-1',
      id: 'fixed-appointment-1',
      rowVersion: 2,
      siteId: 'site-songjiang',
      startAt: new Date('2026-07-23T09:00:00.000Z'),
    };
    const appointmentUpdate = vi.fn().mockResolvedValue({ count: 1 });
    const client = {
      $queryRaw: vi.fn().mockResolvedValue([{ acquired: 1 }]),
      appointment: {
        findMany: vi.fn().mockResolvedValueOnce([fixedAppointment]).mockResolvedValueOnce([]),
        updateMany: appointmentUpdate,
      },
      leaveRecord: {
        findUnique: vi.fn().mockResolvedValue({
          artist: { siteId: 'site-songjiang', userId: 'user-artist' },
          host: null,
          id: 'leave-1',
          rowVersion: 1,
          startDate: range.startDate,
          status: 'ACTIVE',
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const { append, service } = createService(client);
    const artistContext = {
      ...context,
      roleCode: 'ARTIST',
      userId: 'user-artist',
    } as const;

    await service.cancel(artistContext, { expectedRowVersion: 1, leaveId: 'leave-1' }, now);

    expect(client.appointment.findMany.mock.calls[0]?.[0]).toMatchObject({
      where: {
        cancellationReasonCode: 'ARTIST_LEAVE',
        cancellationSourceId: 'leave-1',
        cancellationSourceType: 'LEAVE_RECORD',
        fixedRuleId: { not: null },
        status: 'CANCELLED',
      },
    });
    const appointmentUpdateCall: unknown = appointmentUpdate.mock.calls[0]?.[0];
    expect(appointmentUpdateCall).toMatchObject({
      data: {
        cancellationSourceId: null,
        cancelledAt: null,
        dailySequence: 1,
        status: 'BOOKED',
      },
      where: {
        cancellationSourceId: 'leave-1',
        id: 'fixed-appointment-1',
        status: 'CANCELLED',
      },
    });
    const restoredAudit: unknown = append.mock.calls[0]?.[1];
    expect(restoredAudit).toMatchObject({
      action: 'FIXED_APPOINTMENT_RESTORED_AFTER_LEAVE_CANCEL',
      objectId: 'fixed-appointment-1',
    });
    const leaveAudit: unknown = append.mock.calls[1]?.[1];
    expect(leaveAudit).toMatchObject({
      action: 'LEAVE_CANCELLED',
      afterData: { restoredFixedAppointmentCount: 1 },
    });
  });

  it('rejects leave cancellation when a released fixed slot has been occupied', async () => {
    const fixedAppointment = {
      appointmentDate: range.startDate,
      artistId: 'artist-1',
      dailySequence: 1,
      endAt: new Date('2026-07-23T09:30:00.000Z'),
      fixedRule: {
        durationMinutes: 30,
        startMinute: 1020,
        status: 'ACTIVE',
        validFrom: new Date('2026-07-01T00:00:00.000Z'),
        validUntil: null,
        weekdays: [{ isoWeekday: 4 }],
      },
      hostId: 'host-1',
      id: 'fixed-appointment-1',
      rowVersion: 2,
      siteId: 'site-songjiang',
      startAt: new Date('2026-07-23T09:00:00.000Z'),
    };
    const appointmentUpdate = vi.fn();
    const client = {
      $queryRaw: vi.fn().mockResolvedValue([{ acquired: 1 }]),
      appointment: {
        findMany: vi
          .fn()
          .mockResolvedValueOnce([fixedAppointment])
          .mockResolvedValueOnce([
            {
              artistId: 'artist-1',
              dailySequence: 1,
              endAt: new Date('2026-07-23T09:30:00.000Z'),
              hostId: 'another-host',
              startAt: new Date('2026-07-23T09:00:00.000Z'),
            },
          ]),
        updateMany: appointmentUpdate,
      },
      leaveRecord: {
        findUnique: vi.fn().mockResolvedValue({
          artist: { siteId: 'site-songjiang', userId: 'user-artist' },
          host: null,
          id: 'leave-1',
          rowVersion: 1,
          startDate: range.startDate,
          status: 'ACTIVE',
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const { service } = createService(client);
    const artistContext = {
      ...context,
      roleCode: 'ARTIST',
      userId: 'user-artist',
    } as const;

    await expect(
      service.cancel(artistContext, { expectedRowVersion: 1, leaveId: 'leave-1' }, now),
    ).rejects.toBeInstanceOf(LeaveFixedAppointmentRestoreConflictError);
    expect(appointmentUpdate).not.toHaveBeenCalled();
  });

  it('requires an administrator correction reason and rejects stale or started leave', async () => {
    const client = {
      appointment: { findMany: vi.fn().mockResolvedValue([]) },
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
