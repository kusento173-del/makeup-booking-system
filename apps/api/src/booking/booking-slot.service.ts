import { Injectable } from '@nestjs/common';

import { ArtistAvailabilityService } from '../availability/artist-availability.service';
import type { ArtistDayAvailability } from '../availability/artist-availability.types';
import {
  AuthorizationDeniedError,
  AuthorizationPolicyService,
} from '../auth/authorization-policy.service';
import type { VerifiedAuthorizationContext } from '../auth/authorization.types';
import { DatabaseService } from '../database/database.service';
import {
  businessDateMinuteToInstant,
  formatDateOnly,
  isoWeekdayForDate,
} from '../shift/business-date';
import { BookingHostNotFoundError, BookingSiteMismatchError } from './booking-slot.errors';
import {
  BookingAppointmentNotFoundError,
  BookingStateConflictError,
} from './booking-create.errors';
import type {
  BookingSlotInput,
  BookingSlotResult,
  BookingUnavailableReason,
} from './booking-slot.types';
import { listFreeStartMinutes, validateBookingDate, validateBookingDuration } from './booking-time';

@Injectable()
export class BookingSlotService {
  constructor(
    private readonly availability: ArtistAvailabilityService,
    private readonly authorization: AuthorizationPolicyService,
    private readonly database: DatabaseService,
  ) {}

  async getSlots(
    context: VerifiedAuthorizationContext,
    input: BookingSlotInput,
    now = new Date(),
  ): Promise<BookingSlotResult> {
    this.authorization.assertRole(context, ['HOST', 'OPERATOR', 'CUSTOMER_SERVICE', 'ADMIN']);
    validateBookingDate(input.date, now);
    validateBookingDuration(input.durationMinutes);
    const [availability, host] = await Promise.all([
      this.availability.getDay(input.artistId, input.date),
      this.database.read((client) =>
        client.hostProfile.findUnique({
          select: {
            id: true,
            leaveRecords: {
              select: { id: true },
              take: 1,
              where: {
                endDate: { gte: input.date },
                startDate: { lte: input.date },
                status: 'ACTIVE',
              },
            },
            qualificationStatus: true,
            operatorRelations: {
              orderBy: { validFrom: 'desc' },
              select: { operator: { select: { userId: true } } },
              take: 1,
              where: {
                validFrom: { lte: input.date },
                OR: [{ validUntil: null }, { validUntil: { gt: input.date } }],
              },
            },
            site: { select: { status: true } },
            siteId: true,
            userId: true,
          },
          where: { id: input.hostId },
        }),
      ),
    ]);
    if (!host) throw new BookingHostNotFoundError();
    this.assertActorScope(context, host);
    if (host.siteId !== availability.siteId) throw new BookingSiteMismatchError();
    if (host.qualificationStatus !== 'ACTIVE') {
      return this.unavailable(input, availability, 'HOST_INELIGIBLE');
    }
    if (host.site.status !== 'ACTIVE') {
      return this.unavailable(input, availability, 'HOST_SITE_INACTIVE');
    }
    if (host.leaveRecords.length > 0) {
      return this.unavailable(input, availability, 'HOST_ON_LEAVE');
    }
    if (!availability.available) {
      return this.unavailable(input, availability, availability.reason);
    }

    const excludedAppointmentId = input.excludeAppointmentId;
    const excludedAppointment = excludedAppointmentId
      ? await this.database.read((client) =>
          client.appointment.findUnique({
            select: { fixedRuleId: true, hostId: true, status: true },
            where: { id: excludedAppointmentId },
          }),
        )
      : null;
    if (excludedAppointmentId && excludedAppointment?.hostId !== input.hostId) {
      throw new BookingAppointmentNotFoundError();
    }
    if (excludedAppointment && excludedAppointment.status !== 'BOOKED') {
      throw new BookingStateConflictError();
    }

    const weekday = isoWeekdayForDate(input.date);
    const [appointments, fixedOccupations, pendingOccupations] = await this.database.read(
      (client) =>
        Promise.all([
          client.appointment.findMany({
            select: { artistId: true, endAt: true, hostId: true, startAt: true },
            where: {
              appointmentDate: input.date,
              ...(excludedAppointmentId ? { id: { not: excludedAppointmentId } } : {}),
              OR: [{ artistId: input.artistId }, { hostId: input.hostId }],
              status: { in: ['BOOKED', 'COMPLETED'] },
            },
          }),
          client.fixedAppointmentRuleWeekday.findMany({
            select: { endMinute: true, startMinute: true },
            where: {
              isoWeekday: weekday,
              ...(excludedAppointment?.fixedRuleId
                ? { ruleId: { not: excludedAppointment.fixedRuleId } }
                : {}),
              OR: [{ artistId: input.artistId }, { hostId: input.hostId }],
              validFrom: { lte: input.date },
              AND: [{ OR: [{ validUntil: null }, { validUntil: { gt: input.date } }] }],
            },
          }),
          client.fixedAppointmentRequest.findMany({
            select: { targetDurationMinutes: true, targetStartMinute: true },
            where: {
              effectiveFrom: { lte: input.date },
              OR: [{ targetArtistId: input.artistId }, { hostId: input.hostId }],
              status: 'PENDING',
              targetWeekdays: { has: weekday },
            },
          }),
        ]),
    );
    const existingAppointmentCount = appointments.filter(
      (appointment) => appointment.hostId === input.hostId,
    ).length;
    if (existingAppointmentCount >= 2) {
      return this.result(input, null, existingAppointmentCount, [], 'HOST_DAILY_LIMIT_REACHED');
    }

    const recurringOccupations = [
      ...fixedOccupations,
      ...pendingOccupations.flatMap((request) => {
        const startMinute = request.targetStartMinute;
        const durationMinutes = request.targetDurationMinutes;
        return startMinute === null || durationMinutes === null
          ? []
          : [{ endMinute: startMinute + durationMinutes, startMinute }];
      }),
    ].map((occupation) => ({
      endAt: businessDateMinuteToInstant(input.date, occupation.endMinute),
      startAt: businessDateMinuteToInstant(input.date, occupation.startMinute),
    }));
    const starts = listFreeStartMinutes(input.date, availability.intervals, input.durationMinutes, [
      ...appointments,
      ...recurringOccupations,
    ]);
    return this.result(
      input,
      availability.source,
      existingAppointmentCount,
      starts.map((startMinute) => {
        const startAt = businessDateMinuteToInstant(input.date, startMinute);
        return {
          endAt: new Date(startAt.getTime() + input.durationMinutes * 60_000).toISOString(),
          startAt: startAt.toISOString(),
          startMinute,
        };
      }),
      null,
    );
  }

  private assertActorScope(
    context: VerifiedAuthorizationContext,
    host: {
      readonly operatorRelations: readonly {
        readonly operator: { readonly userId: string | null };
      }[];
      readonly siteId: string;
      readonly userId: string | null;
    },
  ): void {
    switch (context.roleCode) {
      case 'HOST':
        if (host.userId !== context.userId) throw new AuthorizationDeniedError();
        return;
      case 'OPERATOR':
        if (host.operatorRelations[0]?.operator.userId !== context.userId) {
          throw new AuthorizationDeniedError();
        }
        return;
      case 'CUSTOMER_SERVICE':
        this.authorization.assertSiteScope(context, host.siteId);
        return;
      case 'ADMIN':
        return;
      case 'ARTIST':
        throw new AuthorizationDeniedError();
    }
  }

  private unavailable(
    input: BookingSlotInput,
    availability: ArtistDayAvailability,
    reason: BookingUnavailableReason,
  ): BookingSlotResult {
    return this.result(input, availability.available ? availability.source : null, 0, [], reason);
  }

  private result(
    input: BookingSlotInput,
    availabilitySource: BookingSlotResult['availabilitySource'],
    existingAppointmentCount: number,
    slots: BookingSlotResult['slots'],
    unavailableReason: BookingSlotResult['unavailableReason'],
  ): BookingSlotResult {
    return {
      artistId: input.artistId,
      availabilitySource,
      date: formatDateOnly(input.date),
      durationMinutes: input.durationMinutes,
      existingAppointmentCount,
      hostId: input.hostId,
      requiresSecondConfirmation: existingAppointmentCount === 1,
      slots,
      unavailableReason,
    };
  }
}
