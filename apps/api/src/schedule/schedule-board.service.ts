import { Prisma } from '@makeup/database';
import { Injectable } from '@nestjs/common';

import {
  AuthorizationDeniedError,
  AuthorizationPolicyService,
} from '../auth/authorization-policy.service';
import type { VerifiedAuthorizationContext } from '../auth/authorization.types';
import { DatabaseService } from '../database/database.service';
import { MasterDataNotFoundError } from '../master-data/master-data.errors';
import {
  formatDateOnly,
  instantToBusinessDateMinute,
  isoWeekdayForDate,
  toBusinessDate,
} from '../shift/business-date';
import { workIntervalsForWeekday, type ShiftDefinition } from '../shift/shift-time';
import { BookingStateConflictError } from '../booking/booking-create.errors';
import { ScheduleDateOutOfRangeError, ScheduleSiteRequiredError } from './schedule-board.errors';
import type {
  ScheduleAppointmentItem,
  ScheduleArtistRow,
  ScheduleBoard,
  ScheduleBoardInput,
} from './schedule-board.types';

const ARTIST_SELECT = {
  employmentStatus: true,
  id: true,
  leaveRecords: { select: { id: true }, take: 1, where: { status: 'ACTIVE' } },
  nickname: true,
  overtimes: {
    select: {
      breakEndMinute: true,
      breakStartMinute: true,
      workEndMinute: true,
      workStartMinute: true,
    },
    take: 1,
    where: { status: 'APPROVED' },
  },
  shiftTemplates: {
    orderBy: { versionNo: 'desc' as const },
    select: {
      breakEndMinute: true,
      breakStartMinute: true,
      workEndMinute: true,
      workStartMinute: true,
      workdays: true,
    },
    take: 1,
  },
} satisfies Prisma.ArtistProfileSelect;

const APPOINTMENT_SELECT = {
  appointmentType: true,
  artistId: true,
  dailySequence: true,
  durationMinutes: true,
  endAt: true,
  hostCodeSnapshot: true,
  hostId: true,
  hostNameSnapshot: true,
  id: true,
  operatorIdAtBooking: true,
  operatorNameSnapshot: true,
  rowVersion: true,
  startAt: true,
  status: true,
} satisfies Prisma.AppointmentSelect;

type ArtistRecord = Prisma.ArtistProfileGetPayload<{ select: typeof ARTIST_SELECT }>;
type AppointmentRecord = Prisma.AppointmentGetPayload<{ select: typeof APPOINTMENT_SELECT }>;

@Injectable()
export class ScheduleBoardService {
  constructor(
    private readonly authorization: AuthorizationPolicyService,
    private readonly database: DatabaseService,
  ) {}

  get(
    context: VerifiedAuthorizationContext,
    input: ScheduleBoardInput,
    now = new Date(),
  ): Promise<ScheduleBoard> {
    this.authorization.assertRole(context, ['CUSTOMER_SERVICE', 'ADMIN']);
    if (input.date.getTime() > toBusinessDate(now).getTime() + 7 * 86_400_000) {
      throw new ScheduleDateOutOfRangeError();
    }
    const siteId = this.siteId(context, input.siteId);
    return this.database.read(async (client) => {
      const site = await client.site.findUnique({
        select: { id: true, name: true, status: true },
        where: { id: siteId },
      });
      if (!site) throw new MasterDataNotFoundError('site');
      const [artists, appointments] = await Promise.all([
        client.artistProfile.findMany({
          orderBy: [{ nickname: 'asc' }, { id: 'asc' }],
          select: {
            ...ARTIST_SELECT,
            leaveRecords: {
              ...ARTIST_SELECT.leaveRecords,
              where: {
                endDate: { gte: input.date },
                startDate: { lte: input.date },
                status: 'ACTIVE',
              },
            },
            overtimes: {
              ...ARTIST_SELECT.overtimes,
              where: { overtimeDate: input.date, status: 'APPROVED' },
            },
            shiftTemplates: {
              ...ARTIST_SELECT.shiftTemplates,
              where: {
                validFrom: { lte: input.date },
                OR: [{ validUntil: null }, { validUntil: { gt: input.date } }],
              },
            },
          },
          where: {
            siteId,
            OR: [
              { employmentStatus: 'ACTIVE' },
              {
                appointments: {
                  some: {
                    appointmentDate: input.date,
                    status: { in: ['BOOKED', 'COMPLETED'] },
                  },
                },
              },
            ],
          },
        }),
        client.appointment.findMany({
          orderBy: [{ startAt: 'asc' }, { artistId: 'asc' }, { id: 'asc' }],
          select: APPOINTMENT_SELECT,
          where: {
            appointmentDate: input.date,
            siteId,
            status: { in: ['BOOKED', 'COMPLETED'] },
          },
        }),
      ]);
      const grouped = new Map<string, AppointmentRecord[]>();
      for (const appointment of appointments) {
        const items = grouped.get(appointment.artistId) ?? [];
        items.push(appointment);
        grouped.set(appointment.artistId, items);
      }
      return {
        artists: artists.map((artist) =>
          this.artistRow(artist, grouped.get(artist.id) ?? [], input.date, site.status, now),
        ),
        date: formatDateOnly(input.date),
        lastUpdatedAt: now.toISOString(),
        siteId: site.id,
        siteName: site.name,
      };
    });
  }

  private siteId(context: VerifiedAuthorizationContext, requestedSiteId: string | undefined) {
    if (context.roleCode === 'CUSTOMER_SERVICE') {
      if (!context.siteId || (requestedSiteId && requestedSiteId !== context.siteId)) {
        throw new AuthorizationDeniedError();
      }
      return context.siteId;
    }
    if (!requestedSiteId) throw new ScheduleSiteRequiredError();
    return requestedSiteId;
  }

  private artistRow(
    artist: ArtistRecord,
    appointments: readonly AppointmentRecord[],
    date: Date,
    siteStatus: string,
    now: Date,
  ): ScheduleArtistRow {
    const base = {
      appointments: appointments.map((appointment) => this.appointment(appointment, date, now)),
      artistId: artist.id,
      artistNickname: artist.nickname,
    };
    if (siteStatus !== 'ACTIVE') return this.unavailable(base, 'SITE_INACTIVE');
    if (artist.employmentStatus !== 'ACTIVE') return this.unavailable(base, 'ARTIST_INACTIVE');
    const shift = artist.shiftTemplates[0];
    if (!shift) return this.unavailable(base, 'SHIFT_NOT_CONFIGURED');
    if (artist.leaveRecords.length > 0) return this.unavailable(base, 'ARTIST_ON_LEAVE');

    const weekday = isoWeekdayForDate(date);
    if (shift.workdays.includes(weekday)) {
      return this.available(base, shift, weekday, 'REGULAR_SHIFT');
    }
    const overtime = artist.overtimes[0];
    if (!overtime) return this.unavailable(base, 'NON_WORKING_DAY');
    return this.available(base, { ...overtime, workdays: [weekday] }, weekday, 'APPROVED_OVERTIME');
  }

  private available(
    base: Pick<ScheduleArtistRow, 'appointments' | 'artistId' | 'artistNickname'>,
    definition: ShiftDefinition,
    weekday: number,
    availabilitySource: NonNullable<ScheduleArtistRow['availabilitySource']>,
  ): ScheduleArtistRow {
    return {
      ...base,
      availabilitySource,
      available: true,
      breakInterval:
        definition.breakStartMinute === null || definition.breakEndMinute === null
          ? null
          : {
              endMinute: definition.breakEndMinute,
              startMinute: definition.breakStartMinute,
            },
      unavailableReason: null,
      workIntervals: workIntervalsForWeekday(definition, weekday),
    };
  }

  private unavailable(
    base: Pick<ScheduleArtistRow, 'appointments' | 'artistId' | 'artistNickname'>,
    unavailableReason: NonNullable<ScheduleArtistRow['unavailableReason']>,
  ): ScheduleArtistRow {
    return {
      ...base,
      availabilitySource: null,
      available: false,
      breakInterval: null,
      unavailableReason,
      workIntervals: [],
    };
  }

  private appointment(
    appointment: AppointmentRecord,
    date: Date,
    now: Date,
  ): ScheduleAppointmentItem {
    if (
      !['FIXED', 'SINGLE'].includes(appointment.appointmentType) ||
      !['BOOKED', 'COMPLETED'].includes(appointment.status) ||
      ![1, 2].includes(appointment.dailySequence)
    ) {
      throw new BookingStateConflictError();
    }
    return {
      appointmentType: appointment.appointmentType as ScheduleAppointmentItem['appointmentType'],
      dailySequence: appointment.dailySequence as 1 | 2,
      durationMinutes: appointment.durationMinutes,
      endAt: appointment.endAt.toISOString(),
      endMinute: instantToBusinessDateMinute(date, appointment.endAt),
      hostCode: appointment.hostCodeSnapshot,
      hostId: appointment.hostId,
      hostName: appointment.hostNameSnapshot,
      id: appointment.id,
      operatorId: appointment.operatorIdAtBooking,
      operatorName: appointment.operatorNameSnapshot,
      rowVersion: appointment.rowVersion,
      startAt: appointment.startAt.toISOString(),
      startMinute: instantToBusinessDateMinute(date, appointment.startAt),
      status:
        appointment.status === 'BOOKED' && appointment.endAt <= now
          ? 'COMPLETED'
          : (appointment.status as ScheduleAppointmentItem['status']),
    };
  }
}
