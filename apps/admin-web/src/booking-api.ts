import { apiRequest } from './api-client';

export type BookingDuration = 15 | 30 | 45 | 60;

export interface BookingSlot {
  readonly endAt: string;
  readonly startAt: string;
  readonly startMinute: number;
}

export interface BookingSlotResult {
  readonly artistId: string;
  readonly availabilitySource: 'APPROVED_OVERTIME' | 'REGULAR_SHIFT' | null;
  readonly date: string;
  readonly durationMinutes: BookingDuration;
  readonly existingAppointmentCount: number;
  readonly hostId: string;
  readonly requiresSecondConfirmation: boolean;
  readonly slots: readonly BookingSlot[];
  readonly unavailableReason: string | null;
}

export interface BookingMutationResult {
  readonly appointment: { readonly id: string };
  readonly replayed: boolean;
}

export function getBookingSlots(
  token: string,
  input: {
    readonly artistId: string;
    readonly date: string;
    readonly durationMinutes: BookingDuration;
    readonly excludeAppointmentId?: string;
    readonly hostId: string;
  },
): Promise<BookingSlotResult> {
  const query = new URLSearchParams({
    artistId: input.artistId,
    date: input.date,
    durationMinutes: String(input.durationMinutes),
    hostId: input.hostId,
  });
  if (input.excludeAppointmentId) query.set('excludeAppointmentId', input.excludeAppointmentId);
  return apiRequest(`/booking-slots?${query.toString()}`, { token });
}

export function cancelBooking(
  token: string,
  appointmentId: string,
  input: { readonly expectedRowVersion: number; readonly reason: string },
): Promise<{ readonly id: string; readonly rowVersion: number; readonly status: 'CANCELLED' }> {
  return apiRequest(`/appointments/${appointmentId}/cancel`, {
    body: input,
    method: 'POST',
    token,
  });
}

export function rescheduleBooking(
  token: string,
  appointmentId: string,
  input: {
    readonly artistId: string;
    readonly confirmedSecondBooking: boolean;
    readonly date: string;
    readonly durationMinutes: BookingDuration;
    readonly expectedRowVersion: number;
    readonly reason: string;
    readonly startMinute: number;
  },
  idempotencyKey: string,
): Promise<BookingMutationResult> {
  return apiRequest(`/appointments/${appointmentId}/reschedule`, {
    body: input,
    headers: { 'Idempotency-Key': idempotencyKey },
    method: 'POST',
    token,
  });
}
