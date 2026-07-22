import { Injectable } from '@nestjs/common';

import { ArtistAvailabilityService } from '../availability/artist-availability.service';
import type { ArtistDayAvailability } from '../availability/artist-availability.types';
import { DatabaseService } from '../database/database.service';
import { businessDateMinuteToInstant, formatDateOnly } from '../shift/business-date';
import { BookingHostNotFoundError, BookingSiteMismatchError } from './booking-slot.errors';
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
    private readonly database: DatabaseService,
  ) {}

  async getSlots(input: BookingSlotInput, now = new Date()): Promise<BookingSlotResult> {
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
            site: { select: { status: true } },
            siteId: true,
          },
          where: { id: input.hostId },
        }),
      ),
    ]);
    if (!host) throw new BookingHostNotFoundError();
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

    const appointments = await this.database.read((client) =>
      client.appointment.findMany({
        select: { artistId: true, endAt: true, hostId: true, startAt: true },
        where: {
          appointmentDate: input.date,
          OR: [{ artistId: input.artistId }, { hostId: input.hostId }],
          status: { in: ['BOOKED', 'COMPLETED'] },
        },
      }),
    );
    const existingAppointmentCount = appointments.filter(
      (appointment) => appointment.hostId === input.hostId,
    ).length;
    if (existingAppointmentCount >= 2) {
      return this.result(input, null, existingAppointmentCount, [], 'HOST_DAILY_LIMIT_REACHED');
    }

    const starts = listFreeStartMinutes(
      input.date,
      availability.intervals,
      input.durationMinutes,
      appointments,
    );
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
