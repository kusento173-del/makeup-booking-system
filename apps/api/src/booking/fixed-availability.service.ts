import type { DatabaseClient, Prisma } from '@makeup/database';
import { Injectable } from '@nestjs/common';

import { AvailabilityArtistNotFoundError } from '../availability/artist-availability.errors';
import {
  AuthorizationDeniedError,
  AuthorizationPolicyService,
} from '../auth/authorization-policy.service';
import type { VerifiedAuthorizationContext } from '../auth/authorization.types';
import { DatabaseService } from '../database/database.service';
import { formatDateOnly, isoWeekdayForDate, toBusinessDate } from '../shift/business-date';
import { canFitInShift, listShiftStartMinutes, type ShiftDefinition } from '../shift/shift-time';
import { BookingHostNotFoundError, BookingSiteMismatchError } from './booking-slot.errors';
import { validateBookingDuration } from './booking-time';
import {
  FixedAvailabilityDateInvalidError,
  FixedAvailabilityWeekdaysInvalidError,
} from './fixed-availability.errors';
import { FixedRequestUnavailableError } from './fixed-request.errors';
import type {
  FixedAvailabilityInput,
  FixedAvailabilityResult,
  FixedAvailabilitySlot,
  FixedAvailabilityUnavailableReason,
} from './fixed-availability.types';

const DAY_MS = 86_400_000;
const SHANGHAI_OFFSET_MINUTES = 8 * 60;

interface ShiftVersion extends ShiftDefinition {
  readonly validFrom: Date;
  readonly validUntil: Date | null;
}

interface TimedAppointment {
  readonly appointmentDate: Date;
  readonly endAt: Date;
  readonly startAt: Date;
}

interface TimedUnavailablePeriod {
  readonly endMinute: number;
  readonly startMinute: number;
  readonly unavailableDate: Date;
}

export interface FixedAvailabilityQueryOptions {
  readonly excludeRuleId?: string;
  readonly excludeRequestId?: string;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

export function validateFixedAvailabilityInput(
  input: FixedAvailabilityInput,
  now: Date,
): readonly number[] {
  validateBookingDuration(input.durationMinutes);
  validateFixedEffectiveDate(input.requestedStartDate, now);
  const weekdays = [...new Set(input.weekdays)].sort((left, right) => left - right);
  if (
    weekdays.length === 0 ||
    weekdays.length !== input.weekdays.length ||
    weekdays.some((weekday) => !Number.isSafeInteger(weekday) || weekday < 1 || weekday > 7)
  ) {
    throw new FixedAvailabilityWeekdaysInvalidError();
  }
  return weekdays;
}

export function validateFixedEffectiveDate(effectiveFrom: Date, now: Date): void {
  if (
    Number.isNaN(effectiveFrom.getTime()) ||
    effectiveFrom.getUTCHours() !== 0 ||
    effectiveFrom.getUTCMinutes() !== 0 ||
    effectiveFrom.getUTCSeconds() !== 0 ||
    effectiveFrom.getUTCMilliseconds() !== 0 ||
    effectiveFrom.getTime() < addDays(toBusinessDate(now), 1).getTime()
  ) {
    throw new FixedAvailabilityDateInvalidError();
  }
}

function appointmentMinute(instant: Date, date: Date): number {
  return Math.round((instant.getTime() - date.getTime()) / 60_000) + SHANGHAI_OFFSET_MINUTES;
}

function overlaps(start: number, end: number, otherStart: number, otherEnd: number): boolean {
  return start < otherEnd && end > otherStart;
}

function versionContainsWeekday(version: ShiftVersion, weekday: number, fromDate: Date): boolean {
  const start = new Date(Math.max(version.validFrom.getTime(), fromDate.getTime()));
  const daysUntilWeekday = (weekday - isoWeekdayForDate(start) + 7) % 7;
  const firstOccurrence = addDays(start, daysUntilWeekday);
  return version.validUntil === null || firstOccurrence < version.validUntil;
}

function relevantWeekdays(version: ShiftVersion, weekdays: readonly number[], fromDate: Date) {
  return weekdays.filter((weekday) => versionContainsWeekday(version, weekday, fromDate));
}

function expandLeaveDates(
  records: readonly { readonly endDate: Date; readonly startDate: Date }[],
  fromDate: Date,
  weekdays: readonly number[],
): readonly string[] {
  const dates = new Set<string>();
  for (const record of records) {
    for (
      let date = new Date(Math.max(record.startDate.getTime(), fromDate.getTime()));
      date <= record.endDate;
      date = addDays(date, 1)
    ) {
      if (weekdays.includes(isoWeekdayForDate(date))) dates.add(formatDateOnly(date));
    }
  }
  return [...dates].sort();
}

@Injectable()
export class FixedAvailabilityService {
  constructor(
    private readonly authorization: AuthorizationPolicyService,
    private readonly database: DatabaseService,
  ) {}

  getAvailability(
    context: VerifiedAuthorizationContext,
    input: FixedAvailabilityInput,
    now = new Date(),
  ): Promise<FixedAvailabilityResult> {
    this.authorization.assertRole(context, ['OPERATOR', 'CUSTOMER_SERVICE', 'ADMIN']);
    return this.database.read(async (client) => {
      if (input.currentRuleId) {
        const rule = await client.fixedAppointmentRule.findFirst({
          select: { id: true },
          where: {
            artistId: input.artistId,
            hostId: input.hostId,
            id: input.currentRuleId,
            status: 'ACTIVE',
          },
        });
        if (!rule) throw new FixedRequestUnavailableError();
      }
      return this.getAvailabilityWithClient(client, context, input, now, {
        ...(input.currentRuleId ? { excludeRuleId: input.currentRuleId } : {}),
      });
    });
  }

  getAvailabilityWithClient(
    client: DatabaseClient | Prisma.TransactionClient,
    context: VerifiedAuthorizationContext,
    input: FixedAvailabilityInput,
    now = new Date(),
    options: FixedAvailabilityQueryOptions = {},
  ): Promise<FixedAvailabilityResult> {
    this.authorization.assertRole(context, ['OPERATOR', 'CUSTOMER_SERVICE', 'ADMIN']);
    const weekdays = validateFixedAvailabilityInput(input, now);
    return this.query(client, context, input, weekdays, options);
  }

  private async query(
    client: DatabaseClient | Prisma.TransactionClient,
    context: VerifiedAuthorizationContext,
    input: FixedAvailabilityInput,
    weekdays: readonly number[],
    options: FixedAvailabilityQueryOptions,
  ): Promise<FixedAvailabilityResult> {
    const [host, artist] = await Promise.all([
      client.hostProfile.findUnique({
        select: {
          fixedRequests: {
            select: { id: true },
            take: 1,
            where: {
              status: 'PENDING',
              ...(options.excludeRequestId ? { id: { not: options.excludeRequestId } } : {}),
            },
          },
          fixedRules: {
            select: { id: true },
            take: 1,
            where: {
              ...(options.excludeRuleId ? { id: { not: options.excludeRuleId } } : {}),
              OR: [{ validUntil: null }, { validUntil: { gt: input.requestedStartDate } }],
            },
          },
          id: true,
          leaveRecords: {
            select: { endDate: true, startDate: true },
            where: { endDate: { gte: input.requestedStartDate }, status: 'ACTIVE' },
          },
          operatorRelations: {
            orderBy: { validFrom: 'desc' },
            select: {
              operator: {
                select: { employmentStatus: true, siteId: true, userId: true },
              },
            },
            take: 1,
            where: {
              validFrom: { lte: input.requestedStartDate },
              OR: [{ validUntil: null }, { validUntil: { gt: input.requestedStartDate } }],
            },
          },
          qualificationStatus: true,
          site: { select: { status: true } },
          siteId: true,
        },
        where: { id: input.hostId },
      }),
      client.artistProfile.findUnique({
        select: {
          employmentStatus: true,
          id: true,
          leaveRecords: {
            select: { endDate: true, startDate: true },
            where: { endDate: { gte: input.requestedStartDate }, status: 'ACTIVE' },
          },
          shiftTemplates: {
            orderBy: { validFrom: 'asc' },
            select: {
              breakEndMinute: true,
              breakStartMinute: true,
              validFrom: true,
              validUntil: true,
              workEndMinute: true,
              workStartMinute: true,
              workdays: true,
            },
            where: {
              OR: [{ validUntil: null }, { validUntil: { gt: input.requestedStartDate } }],
            },
          },
          site: { select: { status: true } },
          siteId: true,
        },
        where: { id: input.artistId },
      }),
    ]);
    if (!host) throw new BookingHostNotFoundError();
    if (!artist) throw new AvailabilityArtistNotFoundError();
    this.assertActorScope(context, host.siteId, host.operatorRelations[0]?.operator ?? null);
    if (host.siteId !== artist.siteId) throw new BookingSiteMismatchError();

    const unavailableReason = this.unavailableReason(host, artist);
    const base = {
      artistId: input.artistId,
      artistLeaveDates: expandLeaveDates(artist.leaveRecords, input.requestedStartDate, weekdays),
      durationMinutes: input.durationMinutes,
      hostId: input.hostId,
      hostLeaveDates: expandLeaveDates(host.leaveRecords, input.requestedStartDate, weekdays),
      requestedStartDate: formatDateOnly(input.requestedStartDate),
      weekdays,
    };
    if (unavailableReason) return { ...base, slots: [], unavailableReason };

    const shifts = artist.shiftTemplates as readonly ShiftVersion[];
    const currentShift = shifts.find(
      (shift) =>
        shift.validFrom <= input.requestedStartDate &&
        (shift.validUntil === null || shift.validUntil > input.requestedStartDate),
    );
    if (!currentShift) return { ...base, slots: [], unavailableReason: 'SHIFT_NOT_CONFIGURED' };
    if (
      shifts.some((shift) =>
        relevantWeekdays(shift, weekdays, input.requestedStartDate).some(
          (weekday) => !shift.workdays.includes(weekday),
        ),
      )
    ) {
      return { ...base, slots: [], unavailableReason: 'NON_WORKING_WEEKDAY' };
    }

    const firstRequirement = shifts
      .flatMap((shift) =>
        relevantWeekdays(shift, weekdays, input.requestedStartDate).map((weekday) => ({
          shift,
          weekday,
        })),
      )
      .at(0);
    if (!firstRequirement) {
      return { ...base, slots: [], unavailableReason: 'SHIFT_NOT_CONFIGURED' };
    }
    const starts = listShiftStartMinutes(
      firstRequirement.shift,
      firstRequirement.weekday,
      input.durationMinutes,
    ).filter((start) =>
      shifts.every((shift) =>
        relevantWeekdays(shift, weekdays, input.requestedStartDate).every((weekday) =>
          canFitInShift(shift, weekday, start, input.durationMinutes),
        ),
      ),
    );
    if (starts.length === 0) {
      return { ...base, slots: [], unavailableReason: 'NO_STABLE_TIME_SLOT' };
    }
    const [fixedOccupations, pendingOccupations, artistSingles, hostSingles, unavailablePeriods] =
      await Promise.all([
        client.fixedAppointmentRuleWeekday.findMany({
          select: {
            endMinute: true,
            isoWeekday: true,
            startMinute: true,
          },
          where: {
            ...(options.excludeRuleId ? { ruleId: { not: options.excludeRuleId } } : {}),
            isoWeekday: { in: [...weekdays] },
            OR: [{ artistId: input.artistId }, { hostId: input.hostId }],
            AND: [{ OR: [{ validUntil: null }, { validUntil: { gt: input.requestedStartDate } }] }],
          },
        }),
        client.fixedAppointmentRequest.findMany({
          select: {
            targetDurationMinutes: true,
            targetStartMinute: true,
            targetWeekdays: true,
          },
          where: {
            hostId: { not: input.hostId },
            ...(options.excludeRequestId ? { id: { not: options.excludeRequestId } } : {}),
            status: 'PENDING',
            targetArtistId: input.artistId,
            targetWeekdays: { hasSome: [...weekdays] },
          },
        }),
        this.findSingles(client, 'artistId', input.artistId, input.requestedStartDate),
        this.findSingles(client, 'hostId', input.hostId, input.requestedStartDate),
        client.artistUnavailablePeriod.findMany({
          select: { endMinute: true, startMinute: true, unavailableDate: true },
          where: {
            artistId: input.artistId,
            status: 'ACTIVE',
            unavailableDate: { gte: input.requestedStartDate },
          },
        }),
      ]);
    const occupations = [
      ...fixedOccupations,
      ...pendingOccupations.flatMap((request) => {
        const startMinute = request.targetStartMinute;
        const durationMinutes = request.targetDurationMinutes;
        if (startMinute === null || durationMinutes === null) return [];
        return request.targetWeekdays
          .filter((weekday) => weekdays.includes(weekday))
          .map((isoWeekday) => ({
            endMinute: startMinute + durationMinutes,
            isoWeekday,
            startMinute,
          }));
      }),
    ];
    const singles = [...artistSingles, ...hostSingles];
    const slots = starts.map((startMinute) =>
      this.slot(
        startMinute,
        input.durationMinutes,
        input.requestedStartDate,
        weekdays,
        occupations,
        singles,
        unavailablePeriods,
      ),
    );
    return { ...base, slots, unavailableReason: null };
  }

  private findSingles(
    client: DatabaseClient | Prisma.TransactionClient,
    field: 'artistId' | 'hostId',
    id: string,
    fromDate: Date,
  ): Promise<TimedAppointment[]> {
    return client.appointment.findMany({
      select: { appointmentDate: true, endAt: true, startAt: true },
      where: {
        appointmentDate: { gte: fromDate },
        appointmentType: 'SINGLE',
        [field]: id,
        status: { in: ['BOOKED', 'COMPLETED'] },
      },
    });
  }

  private slot(
    startMinute: number,
    durationMinutes: number,
    requestedStartDate: Date,
    weekdays: readonly number[],
    fixedOccupations: readonly {
      readonly endMinute: number;
      readonly isoWeekday: number;
      readonly startMinute: number;
    }[],
    singles: readonly TimedAppointment[],
    unavailablePeriods: readonly TimedUnavailablePeriod[],
  ): FixedAvailabilitySlot {
    const endMinute = startMinute + durationMinutes;
    const fixedConflictWeekdays = [
      ...new Set(
        fixedOccupations
          .filter((item) => overlaps(startMinute, endMinute, item.startMinute, item.endMinute))
          .map((item) => item.isoWeekday),
      ),
    ].sort((left, right) => left - right);
    const singleConflictDates = [
      ...new Set(
        singles
          .filter(
            (item) =>
              weekdays.includes(isoWeekdayForDate(item.appointmentDate)) &&
              overlaps(
                startMinute,
                endMinute,
                appointmentMinute(item.startAt, item.appointmentDate),
                appointmentMinute(item.endAt, item.appointmentDate),
              ),
          )
          .map((item) => formatDateOnly(item.appointmentDate)),
      ),
    ].sort();
    const unavailablePeriodConflictDates = [
      ...new Set(
        unavailablePeriods
          .filter(
            (period) =>
              weekdays.includes(isoWeekdayForDate(period.unavailableDate)) &&
              overlaps(startMinute, endMinute, period.startMinute, period.endMinute),
          )
          .map((period) => formatDateOnly(period.unavailableDate)),
      ),
    ].sort();
    const lastConflict = [...singleConflictDates, ...unavailablePeriodConflictDates].sort().at(-1);
    return {
      available: fixedConflictWeekdays.length === 0,
      earliestStartDate:
        fixedConflictWeekdays.length > 0
          ? null
          : lastConflict
            ? formatDateOnly(addDays(new Date(`${lastConflict}T00:00:00.000Z`), 1))
            : formatDateOnly(requestedStartDate),
      endMinute,
      fixedConflictWeekdays,
      singleConflictDates,
      startMinute,
      unavailablePeriodConflictDates,
    };
  }

  private unavailableReason(
    host: {
      readonly fixedRequests: readonly unknown[];
      readonly fixedRules: readonly unknown[];
      readonly qualificationStatus: string;
      readonly site: { readonly status: string };
    },
    artist: {
      readonly employmentStatus: string;
      readonly site: { readonly status: string };
    },
  ): FixedAvailabilityUnavailableReason | null {
    if (host.qualificationStatus !== 'ACTIVE') return 'HOST_INELIGIBLE';
    if (host.site.status !== 'ACTIVE' || artist.site.status !== 'ACTIVE') return 'SITE_INACTIVE';
    if (artist.employmentStatus !== 'ACTIVE') return 'ARTIST_INACTIVE';
    if (host.fixedRules.length > 0) return 'HOST_HAS_ACTIVE_FIXED_RULE';
    if (host.fixedRequests.length > 0) return 'HOST_HAS_PENDING_FIXED_REQUEST';
    return null;
  }

  private assertActorScope(
    context: VerifiedAuthorizationContext,
    siteId: string,
    operator: {
      readonly employmentStatus: string;
      readonly siteId: string;
      readonly userId: string | null;
    } | null,
  ): void {
    if (context.roleCode === 'OPERATOR') {
      if (
        operator?.userId !== context.userId ||
        operator.employmentStatus !== 'ACTIVE' ||
        operator.siteId !== siteId
      ) {
        throw new AuthorizationDeniedError();
      }
      return;
    }
    if (context.roleCode === 'CUSTOMER_SERVICE') {
      this.authorization.assertSiteScope(context, siteId);
    }
  }
}
