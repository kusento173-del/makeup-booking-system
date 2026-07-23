import { apiRequest } from './api-client';

export type BookingDuration = 15 | 30 | 45 | 60;

export interface HostSummary {
  readonly hostCode: string;
  readonly id: string;
  readonly nickname: string | null;
  readonly qualificationStatus: 'ACTIVE' | 'CANCELLED' | 'SUSPENDED';
  readonly realName: string;
  readonly siteId: string;
}

export interface ArtistSummary {
  readonly employmentStatus: 'ACTIVE' | 'INACTIVE';
  readonly id: string;
  readonly initialShiftConfigured: boolean;
  readonly nickname: string;
  readonly siteId: string;
}

export interface SiteSummary {
  readonly id: string;
  readonly name: string;
  readonly status: 'ACTIVE' | 'INACTIVE';
}

export interface Page<T> {
  readonly items: readonly T[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
}

export interface BookingSlot {
  readonly endAt: string;
  readonly startAt: string;
  readonly startMinute: number;
}

export interface BookingSlotResult {
  readonly artistId: string;
  readonly date: string;
  readonly durationMinutes: BookingDuration;
  readonly existingAppointmentCount: number;
  readonly hostId: string;
  readonly requiresSecondConfirmation: boolean;
  readonly slots: readonly BookingSlot[];
  readonly unavailableReason: string | null;
}

export interface BookingResult {
  readonly appointment: {
    readonly artistNickname: string;
    readonly dailySequence: 1 | 2;
    readonly date: string;
    readonly durationMinutes: number;
    readonly endAt: string;
    readonly hostCode: string;
    readonly hostName: string;
    readonly id: string;
    readonly siteName: string;
    readonly startAt: string;
  };
  readonly replayed: boolean;
}

export function listManagedHosts(
  token: string,
  input: {
    readonly date: string;
    readonly page: number;
    readonly pageSize?: number;
    readonly search?: string;
  },
): Promise<Page<HostSummary>> {
  const query = new URLSearchParams({
    asOf: input.date,
    page: String(input.page),
    pageSize: String(input.pageSize ?? 50),
  });
  if (input.search) query.set('search', input.search);
  return apiRequest(`/master-data/hosts?${query.toString()}`, { token });
}

export async function getOwnHost(token: string, date: string): Promise<HostSummary | null> {
  const result = await listManagedHosts(token, { date, page: 1, pageSize: 1 });
  return result.items[0] ?? null;
}

export async function listAvailableArtists(token: string): Promise<readonly ArtistSummary[]> {
  const pageSize = 100;
  const items: ArtistSummary[] = [];
  for (let page = 1; ; page += 1) {
    const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    const result = await apiRequest<Page<ArtistSummary>>(
      `/master-data/artists?${query.toString()}`,
      { token },
    );
    items.push(...result.items);
    if (items.length >= result.total || result.items.length === 0) return items;
  }
}

export function listSites(token: string): Promise<readonly SiteSummary[]> {
  return apiRequest('/master-data/sites', { token });
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

export function createBooking(
  token: string,
  input: {
    readonly artistId: string;
    readonly confirmedSecondBooking: boolean;
    readonly date: string;
    readonly durationMinutes: BookingDuration;
    readonly hostId: string;
    readonly startMinute: number;
  },
  idempotencyKey: string,
): Promise<BookingResult> {
  return apiRequest('/appointments', {
    body: input,
    headers: { 'Idempotency-Key': idempotencyKey },
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
    readonly startMinute: number;
  },
  idempotencyKey: string,
): Promise<BookingResult> {
  return apiRequest(`/appointments/${appointmentId}/reschedule`, {
    body: input,
    headers: { 'Idempotency-Key': idempotencyKey },
    method: 'POST',
    token,
  });
}
