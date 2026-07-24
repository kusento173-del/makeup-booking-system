import type { DatabaseClient } from '@makeup/database';
import { describe, expect, it, vi } from 'vitest';

import type { DatabaseService } from '../database/database.service';
import {
  AvailabilityArtistNotFoundError,
  AvailabilityDateInvalidError,
} from './artist-availability.errors';
import { ArtistAvailabilityService } from './artist-availability.service';

const weekday = new Date('2026-07-23T00:00:00.000Z');
const weekend = new Date('2026-07-25T00:00:00.000Z');
const artist = {
  employmentStatus: 'ACTIVE',
  id: 'artist-1',
  nickname: '柔柔',
  site: { status: 'ACTIVE' },
  siteId: 'site-songjiang',
};
const shift = {
  breakEndMinute: 780,
  breakStartMinute: 720,
  id: 'shift-1',
  workEndMinute: 1080,
  workStartMinute: 540,
  workdays: [1, 2, 3, 4, 5],
};
const overtime = {
  breakEndMinute: null,
  breakStartMinute: null,
  id: 'overtime-1',
  workEndMinute: 1020,
  workStartMinute: 600,
};

function createService(options?: {
  artist?: object | null;
  leave?: object | null;
  overtime?: object | null;
  shift?: object | null;
  unavailablePeriods?: readonly object[];
}) {
  const client = {
    artistUnavailablePeriod: {
      findMany: vi.fn().mockResolvedValue(options?.unavailablePeriods ?? []),
    },
    artistOvertime: {
      findFirst: vi
        .fn()
        .mockResolvedValue(options?.overtime === undefined ? null : options.overtime),
    },
    artistProfile: {
      findUnique: vi
        .fn()
        .mockResolvedValue(options?.artist === undefined ? artist : options.artist),
    },
    artistShiftTemplate: {
      findFirst: vi.fn().mockResolvedValue(options?.shift === undefined ? shift : options.shift),
    },
    leaveRecord: {
      findFirst: vi.fn().mockResolvedValue(options?.leave === undefined ? null : options.leave),
    },
  };
  const database = {
    read: vi.fn((operation: (value: DatabaseClient) => unknown) =>
      operation(client as unknown as DatabaseClient),
    ),
  };
  return {
    client,
    database,
    service: new ArtistAvailabilityService(database as unknown as DatabaseService),
  };
}

describe('ArtistAvailabilityService', () => {
  it('returns lunch-separated intervals from the shift version effective on that date', async () => {
    const { client, service } = createService();

    await expect(service.getDay('artist-1', weekday)).resolves.toEqual({
      artistId: 'artist-1',
      artistNickname: '柔柔',
      available: true,
      date: '2026-07-23',
      intervals: [
        { endMinute: 720, startMinute: 540 },
        { endMinute: 1080, startMinute: 780 },
      ],
      overtimeId: null,
      shiftTemplateId: 'shift-1',
      siteId: 'site-songjiang',
      source: 'REGULAR_SHIFT',
    });
    expect(client.artistShiftTemplate.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          artistId: 'artist-1',
          validFrom: { lte: weekday },
          OR: [{ validUntil: null }, { validUntil: { gt: weekday } }],
        },
      }),
    );
    expect(client.artistOvertime.findFirst).not.toHaveBeenCalled();
  });

  it('removes active temporary unavailable periods from the working intervals', async () => {
    const { client, service } = createService({
      unavailablePeriods: [
        { endMinute: 600, startMinute: 570 },
        { endMinute: 900, startMinute: 840 },
      ],
    });

    await expect(service.getDay('artist-1', weekday)).resolves.toMatchObject({
      available: true,
      intervals: [
        { endMinute: 570, startMinute: 540 },
        { endMinute: 720, startMinute: 600 },
        { endMinute: 840, startMinute: 780 },
        { endMinute: 1080, startMinute: 900 },
      ],
    });
    expect(client.artistUnavailablePeriod.findMany).toHaveBeenCalledWith({
      select: { endMinute: true, startMinute: true },
      where: {
        artistId: 'artist-1',
        status: 'ACTIVE',
        unavailableDate: weekday,
      },
    });
  });

  it('returns a non-working reason when neither a workday nor approved overtime applies', async () => {
    const { service } = createService();

    await expect(service.getDay('artist-1', weekend)).resolves.toEqual({
      artistId: 'artist-1',
      artistNickname: '柔柔',
      available: false,
      date: '2026-07-25',
      intervals: [],
      reason: 'NON_WORKING_DAY',
      siteId: 'site-songjiang',
    });
  });

  it('opens only approved overtime intervals on a regular non-working day', async () => {
    const { service } = createService({ overtime });

    await expect(service.getDay('artist-1', weekend)).resolves.toEqual({
      artistId: 'artist-1',
      artistNickname: '柔柔',
      available: true,
      date: '2026-07-25',
      intervals: [{ endMinute: 1020, startMinute: 600 }],
      overtimeId: 'overtime-1',
      shiftTemplateId: 'shift-1',
      siteId: 'site-songjiang',
      source: 'APPROVED_OVERTIME',
    });
  });

  it('lets active leave override both regular shift and overtime', async () => {
    const regular = createService({ leave: { id: 'leave-1' } });
    const extra = createService({ leave: { id: 'leave-1' }, overtime });

    await expect(regular.service.getDay('artist-1', weekday)).resolves.toMatchObject({
      available: false,
      reason: 'ARTIST_ON_LEAVE',
    });
    await expect(extra.service.getDay('artist-1', weekend)).resolves.toMatchObject({
      available: false,
      reason: 'ARTIST_ON_LEAVE',
    });
  });

  it.each([
    [{ ...artist, employmentStatus: 'INACTIVE' }, 'ARTIST_INACTIVE'],
    [{ ...artist, site: { status: 'INACTIVE' } }, 'SITE_INACTIVE'],
  ] as const)(
    'stops before schedule queries when the artist or site is inactive',
    async (value, reason) => {
      const { client, service } = createService({ artist: value });

      await expect(service.getDay('artist-1', weekday)).resolves.toMatchObject({
        available: false,
        reason,
      });
      expect(client.artistShiftTemplate.findFirst).not.toHaveBeenCalled();
      expect(client.artistOvertime.findFirst).not.toHaveBeenCalled();
      expect(client.leaveRecord.findFirst).not.toHaveBeenCalled();
      expect(client.artistUnavailablePeriod.findMany).not.toHaveBeenCalled();
    },
  );

  it('distinguishes a missing shift from a regular non-working day', async () => {
    const { service } = createService({ shift: null });

    await expect(service.getDay('artist-1', weekday)).resolves.toMatchObject({
      available: false,
      reason: 'SHIFT_NOT_CONFIGURED',
    });
  });

  it('rejects missing artists and non-date-only inputs', async () => {
    const missing = createService({ artist: null });
    await expect(missing.service.getDay('artist-1', weekday)).rejects.toBeInstanceOf(
      AvailabilityArtistNotFoundError,
    );

    const invalid = createService();
    expect(() => invalid.service.getDay('artist-1', new Date('2026-07-23T01:00:00.000Z'))).toThrow(
      AvailabilityDateInvalidError,
    );
    expect(invalid.database.read).not.toHaveBeenCalled();
  });
});
