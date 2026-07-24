import type { DatabaseClient, Prisma } from '@makeup/database';
import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../database/database.service';
import { formatDateOnly, isoWeekdayForDate } from '../shift/business-date';
import {
  subtractMinuteIntervals,
  workIntervalsForWeekday,
  type MinuteInterval,
  type ShiftDefinition,
} from '../shift/shift-time';
import {
  AvailabilityArtistNotFoundError,
  AvailabilityDateInvalidError,
} from './artist-availability.errors';
import type {
  AvailableArtistDay,
  ArtistDayAvailability,
  UnavailableArtistDay,
} from './artist-availability.types';

function assertDateOnly(value: Date): void {
  if (
    Number.isNaN(value.getTime()) ||
    value.getUTCHours() !== 0 ||
    value.getUTCMinutes() !== 0 ||
    value.getUTCSeconds() !== 0 ||
    value.getUTCMilliseconds() !== 0
  ) {
    throw new AvailabilityDateInvalidError();
  }
}

@Injectable()
export class ArtistAvailabilityService {
  constructor(private readonly database: DatabaseService) {}

  getDay(artistId: string, date: Date): Promise<ArtistDayAvailability> {
    assertDateOnly(date);
    return this.database.read((client) => this.getDayWithClient(client, artistId, date));
  }

  async getDayWithClient(
    client: DatabaseClient | Prisma.TransactionClient,
    artistId: string,
    date: Date,
  ): Promise<ArtistDayAvailability> {
    assertDateOnly(date);
    const artist = await client.artistProfile.findUnique({
      select: {
        employmentStatus: true,
        id: true,
        nickname: true,
        site: { select: { status: true } },
        siteId: true,
      },
      where: { id: artistId },
    });
    if (!artist) throw new AvailabilityArtistNotFoundError();
    if (artist.employmentStatus !== 'ACTIVE') {
      return this.unavailable(artist.id, artist.nickname, artist.siteId, date, 'ARTIST_INACTIVE');
    }
    if (artist.site.status !== 'ACTIVE') {
      return this.unavailable(artist.id, artist.nickname, artist.siteId, date, 'SITE_INACTIVE');
    }

    const [shift, leave, unavailablePeriods] = await Promise.all([
      client.artistShiftTemplate.findFirst({
        orderBy: { versionNo: 'desc' },
        select: {
          breakEndMinute: true,
          breakStartMinute: true,
          id: true,
          workEndMinute: true,
          workStartMinute: true,
          workdays: true,
        },
        where: {
          artistId: artist.id,
          validFrom: { lte: date },
          OR: [{ validUntil: null }, { validUntil: { gt: date } }],
        },
      }),
      client.leaveRecord.findFirst({
        select: { id: true },
        where: {
          artistId: artist.id,
          endDate: { gte: date },
          startDate: { lte: date },
          status: 'ACTIVE',
        },
      }),
      client.artistUnavailablePeriod.findMany({
        select: { endMinute: true, startMinute: true },
        where: {
          artistId: artist.id,
          status: 'ACTIVE',
          unavailableDate: date,
        },
      }),
    ]);
    if (!shift) {
      return this.unavailable(
        artist.id,
        artist.nickname,
        artist.siteId,
        date,
        'SHIFT_NOT_CONFIGURED',
      );
    }
    if (leave) {
      return this.unavailable(artist.id, artist.nickname, artist.siteId, date, 'ARTIST_ON_LEAVE');
    }

    const weekday = isoWeekdayForDate(date);
    const regularWorkday = shift.workdays.includes(weekday);
    if (regularWorkday) {
      return this.available(
        artist.id,
        artist.nickname,
        artist.siteId,
        date,
        shift.id,
        null,
        'REGULAR_SHIFT',
        shift,
        unavailablePeriods,
      );
    }
    const overtime = await client.artistOvertime.findFirst({
      select: {
        breakEndMinute: true,
        breakStartMinute: true,
        id: true,
        workEndMinute: true,
        workStartMinute: true,
      },
      where: { artistId: artist.id, overtimeDate: date, status: 'APPROVED' },
    });
    if (!overtime) {
      return this.unavailable(artist.id, artist.nickname, artist.siteId, date, 'NON_WORKING_DAY');
    }
    return this.available(
      artist.id,
      artist.nickname,
      artist.siteId,
      date,
      shift.id,
      overtime.id,
      'APPROVED_OVERTIME',
      overtime,
      unavailablePeriods,
    );
  }

  private available(
    artistId: string,
    artistNickname: string,
    siteId: string,
    date: Date,
    shiftTemplateId: string,
    overtimeId: string | null,
    source: AvailableArtistDay['source'],
    definition: Omit<ShiftDefinition, 'workdays'>,
    unavailablePeriods: readonly MinuteInterval[],
  ): AvailableArtistDay {
    const weekday = isoWeekdayForDate(date);
    return {
      artistId,
      artistNickname,
      available: true,
      date: formatDateOnly(date),
      intervals: subtractMinuteIntervals(
        workIntervalsForWeekday({ ...definition, workdays: [weekday] }, weekday),
        unavailablePeriods,
      ),
      overtimeId,
      shiftTemplateId,
      siteId,
      source,
    };
  }

  private unavailable(
    artistId: string,
    artistNickname: string,
    siteId: string,
    date: Date,
    reason: UnavailableArtistDay['reason'],
  ): UnavailableArtistDay {
    return {
      artistId,
      artistNickname,
      available: false,
      date: formatDateOnly(date),
      intervals: [],
      reason,
      siteId,
    };
  }
}
