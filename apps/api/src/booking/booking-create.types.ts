import type { VerifiedAuthorizationContext } from '../auth/authorization.types';

export interface BookingCommandContext extends VerifiedAuthorizationContext {
  readonly actorName: string;
  readonly clientType?: string;
  readonly ipAddress?: string;
  readonly requestId?: string;
  readonly userAgent?: string;
}

export interface CreateBookingCommand {
  readonly artistId: string;
  readonly confirmedSecondBooking: boolean;
  readonly date: Date;
  readonly durationMinutes: number;
  readonly hostId: string;
  readonly idempotencyKey: string;
  readonly reason?: string;
  readonly startMinute: number;
}

export interface AppointmentSummary {
  readonly appointmentType: 'SINGLE';
  readonly artistId: string;
  readonly artistNickname: string;
  readonly dailySequence: 1 | 2;
  readonly date: string;
  readonly durationMinutes: number;
  readonly endAt: string;
  readonly hostCode: string;
  readonly hostId: string;
  readonly hostName: string;
  readonly id: string;
  readonly operatorId: string | null;
  readonly operatorName: string | null;
  readonly rowVersion: number;
  readonly siteId: string;
  readonly siteName: string;
  readonly startAt: string;
  readonly status: 'BOOKED' | 'CANCELLED' | 'COMPLETED';
}

export interface BookingCreateResult {
  readonly appointment: AppointmentSummary;
  readonly replayed: boolean;
}

export interface CancelBookingCommand {
  readonly appointmentId: string;
  readonly expectedRowVersion: number;
  readonly reason?: string;
}

export interface BookingCancellationResult {
  readonly cancelledAt: string;
  readonly id: string;
  readonly rowVersion: number;
  readonly status: 'CANCELLED';
}

export interface RescheduleBookingCommand {
  readonly appointmentId: string;
  readonly artistId: string;
  readonly confirmedSecondBooking: boolean;
  readonly date: Date;
  readonly durationMinutes: number;
  readonly expectedRowVersion: number;
  readonly idempotencyKey: string;
  readonly reason?: string;
  readonly startMinute: number;
}

export interface BookingRescheduleResult {
  readonly appointment: AppointmentSummary;
  readonly original: BookingCancellationResult;
  readonly replayed: boolean;
}
