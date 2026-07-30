import type { DatabaseClient, Prisma } from '@makeup/database';
import { describe, expect, it, vi } from 'vitest';

import type { ArtistAvailabilityService } from '../availability/artist-availability.service';
import type { AuditCommandService } from '../audit/audit-command.service';
import { AuthorizationPolicyService } from '../auth/authorization-policy.service';
import type { DatabaseService } from '../database/database.service';
import {
  ArtistUnavailablePeriodImpactChangedError,
  ArtistUnavailablePeriodScheduleConflictError,
  ArtistUnavailablePeriodStateConflictError,
} from './artist-unavailability.errors';
import { ArtistUnavailabilityService } from './artist-unavailability.service';
import type { ArtistUnavailabilityCommandContext } from './artist-unavailability.types';

const now = new Date('2026-07-24T04:00:00.000Z');
const unavailableDate = new Date('2026-07-25T00:00:00.000Z');
const artist = {
  employmentStatus: 'ACTIVE',
  id: 'artist-1',
  siteId: 'site-songjiang',
  userId: 'user-artist',
};
const context: ArtistUnavailabilityCommandContext = {
  actorName: '柔柔',
  roleAssignmentId: 'role-artist',
  roleCode: 'ARTIST',
  siteId: null,
  userId: 'user-artist',
};
const range = {
  endMinute: 900,
  startMinute: 840,
  unavailableDate,
};
const affectedAppointment = (id: string) => ({
  appointmentDate: unavailableDate,
  appointmentType: 'SINGLE',
  endAt: new Date('2026-07-25T07:00:00.000Z'),
  hostCodeSnapshot: '000001',
  hostId: 'host-1',
  hostNameSnapshot: '主播一',
  id,
  startAt: new Date('2026-07-25T06:30:00.000Z'),
});
const storedPeriod = {
  affectedAppointmentCount: 1,
  artistId: artist.id,
  endMinute: 900,
  id: 'period-1',
  reason: '上课',
  rowVersion: 1,
  reviewComment: null,
  siteId: artist.siteId,
  startMinute: 840,
  status: 'PENDING',
  unavailableDate,
};

function createService(
  client: object,
  intervals: readonly { readonly endMinute: number; readonly startMinute: number }[] = [
    { endMinute: 1080, startMinute: 780 },
  ],
) {
  const append = vi.fn().mockResolvedValue('log-1');
  const availability = {
    getDayWithClient: vi.fn().mockResolvedValue({
      available: true,
      intervals,
      source: 'REGULAR_SHIFT',
    }),
  };
  const database = {
    read: vi.fn((operation: (value: DatabaseClient) => unknown) =>
      operation(client as DatabaseClient),
    ),
    transaction: vi.fn((operation: (value: Prisma.TransactionClient) => unknown) =>
      operation(client as Prisma.TransactionClient),
    ),
  };
  const service = new ArtistUnavailabilityService(
    { append } as unknown as AuditCommandService,
    availability as unknown as ArtistAvailabilityService,
    new AuthorizationPolicyService(),
    database as unknown as DatabaseService,
  );
  return { append, availability, database, service };
}

describe('ArtistUnavailabilityService', () => {
  it('previews affected appointments for the bound artist', async () => {
    const findMany = vi
      .fn()
      .mockResolvedValue([
        affectedAppointment('appointment-1'),
        affectedAppointment('appointment-2'),
      ]);
    const client = {
      appointment: { findMany },
      artistProfile: { findUnique: vi.fn().mockResolvedValue(artist) },
    };
    const { service } = createService(client);

    await expect(service.preview(context, range, now)).resolves.toMatchObject({
      affectedAppointmentCount: 2,
      artistId: artist.id,
      endMinute: 900,
      siteId: artist.siteId,
      startMinute: 840,
      unavailableDate: '2026-07-25',
    });
    const findCall: unknown = findMany.mock.calls[0]?.[0];
    expect(findCall).toMatchObject({
      where: { artistId: artist.id, status: 'BOOKED' },
    });
  });

  it('rejects a period outside the effective available intervals', async () => {
    const client = {
      appointment: { findMany: vi.fn() },
      artistProfile: { findUnique: vi.fn().mockResolvedValue(artist) },
    };
    const { service } = createService(client, [{ endMinute: 840, startMinute: 780 }]);

    await expect(service.preview(context, range, now)).rejects.toBeInstanceOf(
      ArtistUnavailablePeriodScheduleConflictError,
    );
    expect(client.appointment.findMany).not.toHaveBeenCalled();
  });

  it('submits an artist period for approval without cancelling appointments', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const client = {
      $queryRaw: vi.fn().mockResolvedValue([{ acquired: 1 }]),
      appointment: {
        findMany: vi.fn().mockResolvedValue([affectedAppointment('appointment-1')]),
        updateMany,
      },
      artistProfile: { findUnique: vi.fn().mockResolvedValue(artist) },
      artistUnavailablePeriod: { create: vi.fn().mockResolvedValue(storedPeriod) },
    };
    const { append, service } = createService(client);

    await expect(
      service.create(
        context,
        {
          ...range,
          confirmedAffectedAppointmentCount: 1,
          reason: ' 上课 ',
        },
        now,
      ),
    ).resolves.toMatchObject({ id: 'period-1', reason: '上课' });
    expect(updateMany).not.toHaveBeenCalled();
    expect(append).toHaveBeenCalledWith(
      client,
      context,
      expect.objectContaining({ action: 'ARTIST_UNAVAILABLE_PERIOD_SUBMITTED' }),
    );
  });

  it('requires reconfirmation when the affected appointment count changes', async () => {
    const client = {
      $queryRaw: vi.fn().mockResolvedValue([{ acquired: 1 }]),
      appointment: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            affectedAppointment('appointment-1'),
            affectedAppointment('appointment-2'),
          ]),
        updateMany: vi.fn(),
      },
      artistProfile: { findUnique: vi.fn().mockResolvedValue(artist) },
      artistUnavailablePeriod: { create: vi.fn() },
    };
    const { service } = createService(client);

    await expect(
      service.create(
        context,
        { ...range, confirmedAffectedAppointmentCount: 1, reason: '上课' },
        now,
      ),
    ).rejects.toBeInstanceOf(ArtistUnavailablePeriodImpactChangedError);
    expect(client.artistUnavailablePeriod.create).not.toHaveBeenCalled();
  });

  it('approves a temporary period and records affected appointments as artist leave', async () => {
    const appointmentUpdate = vi.fn().mockResolvedValue({ count: 1 });
    const periodUpdate = vi.fn().mockResolvedValue({ count: 1 });
    const client = {
      $queryRaw: vi.fn().mockResolvedValue([{ acquired: 1 }]),
      appointment: {
        findMany: vi.fn().mockResolvedValue([affectedAppointment('appointment-1')]),
        updateMany: appointmentUpdate,
      },
      artistUnavailablePeriod: {
        findUnique: vi.fn().mockResolvedValue(storedPeriod),
        updateMany: periodUpdate,
      },
    };
    const { service } = createService(client);
    const customerService = {
      ...context,
      actorName: '松江客服',
      roleCode: 'CUSTOMER_SERVICE',
      siteId: artist.siteId,
      userId: 'user-service',
    } as const;

    await expect(
      service.review(
        customerService,
        {
          confirmedAffectedAppointmentCount: 1,
          decision: 'APPROVE',
          expectedRowVersion: 1,
          periodId: 'period-1',
        },
        now,
      ),
    ).resolves.toMatchObject({ status: 'ACTIVE' });
    const periodUpdateCall: unknown = periodUpdate.mock.calls[0]?.[0];
    expect(periodUpdateCall).toMatchObject({
      data: {
        reviewImpactSnapshot: [{ id: 'appointment-1' }],
        status: 'ACTIVE',
      },
      where: { id: 'period-1', rowVersion: 1, status: 'PENDING' },
    });
    const appointmentUpdateCall: unknown = appointmentUpdate.mock.calls[0]?.[0];
    expect(appointmentUpdateCall).toMatchObject({
      data: {
        cancellationReasonCode: 'ARTIST_LEAVE',
        cancellationSourceId: 'period-1',
        status: 'CANCELLED',
      },
    });
  });

  it('lists pending periods with the current affected appointments', async () => {
    const client = {
      appointment: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            affectedAppointment('appointment-1'),
            affectedAppointment('appointment-2'),
          ]),
      },
      artistUnavailablePeriod: {
        findMany: vi.fn().mockResolvedValue([
          {
            ...storedPeriod,
            affectedAppointmentCount: 1,
            artist: { nickname: '柔柔' },
            createdAt: now,
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
          siteId: artist.siteId,
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

  it('lists reviewed periods from the immutable review impact snapshot', async () => {
    const appointment = affectedAppointment('appointment-1');
    const client = {
      artistUnavailablePeriod: {
        findMany: vi.fn().mockResolvedValue([
          {
            ...storedPeriod,
            artist: { nickname: '柔柔' },
            createdAt: now,
            reviewedAt: now,
            reviewImpactSnapshot: [
              {
                appointmentDate: '2026-07-25',
                appointmentType: appointment.appointmentType,
                endAt: appointment.endAt.toISOString(),
                hostCode: appointment.hostCodeSnapshot,
                hostId: appointment.hostId,
                hostName: appointment.hostNameSnapshot,
                id: appointment.id,
                startAt: appointment.startAt.toISOString(),
              },
            ],
            rowVersion: 2,
            status: 'ACTIVE',
          },
        ]),
      },
    };
    const { service } = createService(client);

    await expect(
      service.listReviewed({
        ...context,
        actorName: '松江客服',
        roleCode: 'CUSTOMER_SERVICE',
        siteId: artist.siteId,
        userId: 'user-service',
      }),
    ).resolves.toMatchObject([
      {
        affectedAppointmentCount: 1,
        affectedAppointments: [{ id: 'appointment-1' }],
        reviewedAt: now.toISOString(),
      },
    ]);
  });

  it('cancels an active period without restoring appointments', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const client = {
      artistUnavailablePeriod: {
        findUnique: vi.fn().mockResolvedValue({
          artist: { siteId: artist.siteId, userId: artist.userId },
          id: 'period-1',
          rowVersion: 1,
          status: 'ACTIVE',
          unavailableDate,
        }),
        updateMany,
      },
    };
    const { append, service } = createService(client);

    await expect(
      service.cancel(context, { expectedRowVersion: 1, periodId: 'period-1' }, now),
    ).resolves.toBeUndefined();
    const updateCall: unknown = updateMany.mock.calls[0]?.[0];
    expect(updateCall).toMatchObject({
      data: { rowVersion: { increment: 1 }, status: 'CANCELLED' },
      where: {
        id: 'period-1',
        rowVersion: 1,
        status: { in: ['ACTIVE', 'PENDING'] },
      },
    });
    expect(append).toHaveBeenCalledWith(
      client,
      context,
      expect.objectContaining({ action: 'ARTIST_UNAVAILABLE_PERIOD_CANCELLED' }),
    );
    expect('appointment' in client).toBe(false);
  });

  it('rejects stale cancellation versions', async () => {
    const client = {
      artistUnavailablePeriod: {
        findUnique: vi.fn().mockResolvedValue({
          artist: { siteId: artist.siteId, userId: artist.userId },
          id: 'period-1',
          rowVersion: 1,
          status: 'ACTIVE',
          unavailableDate,
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const { service } = createService(client);

    await expect(
      service.cancel(context, { expectedRowVersion: 1, periodId: 'period-1' }, now),
    ).rejects.toBeInstanceOf(ArtistUnavailablePeriodStateConflictError);
  });
});
