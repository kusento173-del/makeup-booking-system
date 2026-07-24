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
const storedPeriod = {
  affectedAppointmentCount: 1,
  artistId: artist.id,
  endMinute: 900,
  id: 'period-1',
  reason: '上课',
  rowVersion: 1,
  siteId: artist.siteId,
  startMinute: 840,
  status: 'ACTIVE',
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
    const count = vi.fn().mockResolvedValue(2);
    const client = {
      appointment: { count },
      artistProfile: { findUnique: vi.fn().mockResolvedValue(artist) },
    };
    const { service } = createService(client);

    await expect(service.preview(context, range, now)).resolves.toEqual({
      affectedAppointmentCount: 2,
      artistId: artist.id,
      endMinute: 900,
      siteId: artist.siteId,
      startMinute: 840,
      unavailableDate: '2026-07-25',
    });
    const countCall: unknown = count.mock.calls[0]?.[0];
    expect(countCall).toMatchObject({
      where: { artistId: artist.id, status: 'BOOKED' },
    });
  });

  it('rejects a period outside the effective available intervals', async () => {
    const client = {
      appointment: { count: vi.fn() },
      artistProfile: { findUnique: vi.fn().mockResolvedValue(artist) },
    };
    const { service } = createService(client, [{ endMinute: 840, startMinute: 780 }]);

    await expect(service.preview(context, range, now)).rejects.toBeInstanceOf(
      ArtistUnavailablePeriodScheduleConflictError,
    );
    expect(client.appointment.count).not.toHaveBeenCalled();
  });

  it('creates the period and cancels only overlapping booked appointments atomically', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const client = {
      $queryRaw: vi.fn().mockResolvedValue([{ acquired: 1 }]),
      appointment: { count: vi.fn().mockResolvedValue(1), updateMany },
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
    const updateCall: unknown = updateMany.mock.calls[0]?.[0];
    expect(updateCall).toMatchObject({
      data: {
        cancellationReasonCode: 'ARTIST_UNAVAILABLE_PERIOD',
        cancellationSourceId: 'period-1',
        status: 'CANCELLED',
      },
      where: { artistId: artist.id, status: 'BOOKED' },
    });
    expect(append).toHaveBeenCalledWith(
      client,
      context,
      expect.objectContaining({ action: 'ARTIST_UNAVAILABLE_PERIOD_CREATED' }),
    );
  });

  it('requires reconfirmation when the affected appointment count changes', async () => {
    const client = {
      $queryRaw: vi.fn().mockResolvedValue([{ acquired: 1 }]),
      appointment: { count: vi.fn().mockResolvedValue(2), updateMany: vi.fn() },
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
      where: { id: 'period-1', rowVersion: 1, status: 'ACTIVE' },
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
