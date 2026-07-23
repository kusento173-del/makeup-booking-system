import { apiRequest } from './api-client';
import type { AppointmentListItem } from './appointment-api';

export interface HostSummary {
  readonly hostCode: string;
  readonly id: string;
  readonly nickname: string | null;
  readonly qualificationStatus: 'ACTIVE' | 'CANCELLED' | 'SUSPENDED';
  readonly realName: string;
}

export interface ArtistSummary {
  readonly id: string;
  readonly nickname: string;
  readonly siteId: string;
}

interface Page<T> {
  readonly items: readonly T[];
  readonly total: number;
}

export interface BookingSlot {
  readonly endAt: string;
  readonly startAt: string;
  readonly startMinute: number;
}

export interface BookingSlotResult {
  readonly existingAppointmentCount: number;
  readonly requiresSecondConfirmation: boolean;
  readonly slots: readonly BookingSlot[];
  readonly unavailableReason: string | null;
}

export function loadBookingPeople(token: string, date: string) {
  return Promise.all([loadAllHosts(token, date), loadAllArtists(token)]).then(
    ([hosts, artists]) => ({
      artists,
      hosts,
    }),
  );
}

async function loadAllHosts(token: string, date: string): Promise<readonly HostSummary[]> {
  return loadAllPages(token, (page) => `/master-data/hosts?asOf=${date}&page=${page}&pageSize=100`);
}

async function loadAllArtists(token: string): Promise<readonly ArtistSummary[]> {
  return loadAllPages(token, (page) => `/master-data/artists?page=${page}&pageSize=100`);
}

async function loadAllPages<T>(
  token: string,
  path: (page: number) => string,
): Promise<readonly T[]> {
  const items: T[] = [];
  let page = 1;
  while (true) {
    const result = await apiRequest<Page<T>>(path(page), { token });
    items.push(...result.items);
    if (items.length >= result.total || result.items.length === 0) return items;
    page += 1;
  }
}

export function loadBookingSlots(input: {
  readonly artistId: string;
  readonly date: string;
  readonly durationMinutes: number;
  readonly excludeAppointmentId?: string;
  readonly hostId: string;
  readonly token: string;
}): Promise<BookingSlotResult> {
  const query = [
    `artistId=${input.artistId}`,
    `date=${input.date}`,
    `durationMinutes=${input.durationMinutes}`,
    `hostId=${input.hostId}`,
    ...(input.excludeAppointmentId ? [`excludeAppointmentId=${input.excludeAppointmentId}`] : []),
  ].join('&');
  return apiRequest(`/booking-slots?${query}`, { token: input.token });
}

export function rescheduleBooking(input: {
  readonly appointmentId: string;
  readonly artistId: string;
  readonly confirmedSecondBooking: boolean;
  readonly date: string;
  readonly durationMinutes: number;
  readonly expectedRowVersion: number;
  readonly idempotencyKey: string;
  readonly startMinute: number;
  readonly token: string;
}): Promise<{ readonly appointment: AppointmentListItem; readonly replayed: boolean }> {
  return apiRequest(`/appointments/${input.appointmentId}/reschedule`, {
    body: {
      artistId: input.artistId,
      confirmedSecondBooking: input.confirmedSecondBooking,
      date: input.date,
      durationMinutes: input.durationMinutes,
      expectedRowVersion: input.expectedRowVersion,
      startMinute: input.startMinute,
    },
    headers: { 'Idempotency-Key': input.idempotencyKey },
    method: 'POST',
    token: input.token,
  });
}

export function createBooking(input: {
  readonly artistId: string;
  readonly confirmedSecondBooking: boolean;
  readonly date: string;
  readonly durationMinutes: number;
  readonly hostId: string;
  readonly idempotencyKey: string;
  readonly startMinute: number;
  readonly token: string;
}): Promise<{ readonly appointment: AppointmentListItem; readonly replayed: boolean }> {
  return apiRequest('/appointments', {
    body: {
      artistId: input.artistId,
      confirmedSecondBooking: input.confirmedSecondBooking,
      date: input.date,
      durationMinutes: input.durationMinutes,
      hostId: input.hostId,
      startMinute: input.startMinute,
    },
    headers: { 'Idempotency-Key': input.idempotencyKey },
    method: 'POST',
    token: input.token,
  });
}
