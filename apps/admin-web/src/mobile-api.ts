import { apiRequest } from './api-client';

export type MobileRoleCode = 'ARTIST' | 'HOST' | 'OPERATOR';
export type BookingDuration = 15 | 30 | 45 | 60;

export interface MobileHost {
  readonly hostCode: string;
  readonly id: string;
  readonly nickname: string | null;
  readonly qualificationStatus: 'ACTIVE' | 'CANCELLED';
  readonly realName: string;
  readonly siteId: string;
}

export interface MobileArtist {
  readonly employmentStatus: 'ACTIVE' | 'INACTIVE';
  readonly id: string;
  readonly initialShiftConfigured: boolean;
  readonly nickname: string;
  readonly siteId: string;
}

export interface MobileAppointment {
  readonly appointmentType: 'FIXED' | 'SINGLE';
  readonly artistNickname: string;
  readonly dailySequence: 1 | 2;
  readonly date: string;
  readonly durationMinutes: number;
  readonly endAt: string;
  readonly hostCode: string;
  readonly hostId: string;
  readonly hostName: string;
  readonly id: string;
  readonly rowVersion: number;
  readonly siteName: string;
  readonly startAt: string;
  readonly status: 'BOOKED' | 'CANCELLED' | 'COMPLETED';
}

export interface BookingSlot {
  readonly endAt: string;
  readonly startAt: string;
  readonly startMinute: number;
}

export interface BookingSlots {
  readonly existingAppointmentCount: number;
  readonly requiresSecondConfirmation: boolean;
  readonly slots: readonly BookingSlot[];
  readonly unavailableReason: string | null;
}

export interface LeaveRecord {
  readonly affectedAppointmentCount: number;
  readonly endDate: string;
  readonly id: string;
  readonly reason: string | null;
  readonly rowVersion: number;
  readonly startDate: string;
  readonly status: 'ACTIVE' | 'CANCELLED';
}

export interface ShiftDefinition {
  readonly breakEndMinute: number | null;
  readonly breakStartMinute: number | null;
  readonly workEndMinute: number;
  readonly workStartMinute: number;
  readonly workdays: readonly number[];
}

export interface ArtistShift extends ShiftDefinition {
  readonly id: string;
  readonly validFrom: string;
  readonly validUntil: string | null;
  readonly versionNo: number;
}

export interface ShiftChange extends ShiftDefinition {
  readonly effectiveFrom: string;
  readonly id: string;
  readonly reason: string;
  readonly reviewComment?: string | null;
  readonly rowVersion: number;
  readonly status: 'APPROVED' | 'PENDING' | 'REJECTED' | 'WITHDRAWN';
  readonly submittedAt: string;
}

export interface OvertimeRecord extends Omit<ShiftDefinition, 'workdays'> {
  readonly affectedAppointmentCount: number;
  readonly id: string;
  readonly overtimeDate: string;
  readonly reason: string;
  readonly reviewComment: string | null;
  readonly rowVersion: number;
  readonly status: 'APPROVED' | 'PENDING' | 'REJECTED' | 'WITHDRAWN';
}

export interface UnavailablePeriod {
  readonly affectedAppointmentCount: number;
  readonly endMinute: number;
  readonly id: string;
  readonly reason: string;
  readonly rowVersion: number;
  readonly startMinute: number;
  readonly status: 'ACTIVE' | 'CANCELLED';
  readonly unavailableDate: string;
}

export interface FixedRule {
  readonly artistId: string;
  readonly artistNickname: string;
  readonly durationMinutes: number;
  readonly id: string;
  readonly rowVersion: number;
  readonly startMinute: number;
  readonly validFrom: string;
  readonly weekdays: readonly number[];
}

export interface MyFixedRelation {
  readonly artistId: string;
  readonly artistNickname: string;
  readonly durationMinutes: number;
  readonly hostCode: string;
  readonly hostId: string;
  readonly hostName: string;
  readonly id: string;
  readonly siteId: string;
  readonly siteName: string;
  readonly startMinute: number;
  readonly validFrom: string;
  readonly validUntil: string | null;
  readonly weekdays: readonly number[];
}

export interface ManagedHost {
  readonly activeRule: FixedRule | null;
  readonly bookingAvailability:
    'AVAILABLE' | 'ON_LEAVE' | 'QUALIFICATION_BLOCKED' | 'SITE_INACTIVE';
  readonly hostCode: string;
  readonly hostId: string;
  readonly hostName: string;
  readonly pendingRequest: {
    readonly effectiveFrom: string;
    readonly id: string;
    readonly requestType: 'CANCEL' | 'CHANGE' | 'CREATE';
    readonly rowVersion: number;
  } | null;
  readonly siteId: string;
  readonly siteName: string;
}

export interface FixedRequest {
  readonly effectiveFrom: string;
  readonly hostCode: string;
  readonly hostId: string;
  readonly hostName: string;
  readonly id: string;
  readonly reason: string;
  readonly requestType: 'CANCEL' | 'CHANGE' | 'CREATE';
  readonly reviewComment: string | null;
  readonly rowVersion: number;
  readonly status: 'APPROVED' | 'PENDING' | 'REJECTED' | 'WITHDRAWN';
  readonly targetArtistNickname: string | null;
  readonly targetDurationMinutes: number | null;
  readonly targetStartMinute: number | null;
  readonly targetWeekdays: readonly number[];
}

export interface FixedAvailability {
  readonly slots: readonly {
    readonly available: boolean;
    readonly earliestStartDate: string | null;
    readonly endMinute: number;
    readonly fixedConflictWeekdays: readonly number[];
    readonly singleConflictDates: readonly string[];
    readonly startMinute: number;
    readonly unavailablePeriodConflictDates: readonly string[];
  }[];
  readonly unavailableReason: string | null;
}

interface Page<T> {
  readonly items: readonly T[];
  readonly total: number;
}

export function listAppointments(
  token: string,
  fromDate: string,
  toDate: string,
): Promise<Page<MobileAppointment>> {
  return listAllPages<MobileAppointment>('/appointments', token, { fromDate, toDate });
}

async function listAllPages<T>(
  path: string,
  token: string,
  parameters: Readonly<Record<string, string>>,
): Promise<Page<T>> {
  const items: T[] = [];
  let page = 1;
  while (true) {
    const query = new URLSearchParams({
      ...parameters,
      page: String(page),
      pageSize: '100',
    });
    const result = await apiRequest<Page<T>>(`${path}?${query.toString()}`, { token });
    items.push(...result.items);
    if (result.items.length === 0 || items.length >= result.total) {
      return { items, total: result.total };
    }
    page += 1;
  }
}

export function cancelAppointment(
  token: string,
  appointmentId: string,
  expectedRowVersion: number,
): Promise<{ readonly rowVersion: number; readonly status: 'CANCELLED' }> {
  return apiRequest(`/appointments/${appointmentId}/cancel`, {
    body: { expectedRowVersion },
    method: 'POST',
    token,
  });
}

export function listHosts(token: string, date: string): Promise<Page<MobileHost>> {
  const query = new URLSearchParams({ asOf: date, page: '1', pageSize: '100' });
  return apiRequest(`/master-data/hosts?${query.toString()}`, { token });
}

export function listArtists(token: string): Promise<Page<MobileArtist>> {
  return apiRequest('/master-data/artists?page=1&pageSize=100', { token });
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
): Promise<BookingSlots> {
  const query = new URLSearchParams({
    artistId: input.artistId,
    date: input.date,
    durationMinutes: String(input.durationMinutes),
    hostId: input.hostId,
  });
  if (input.excludeAppointmentId) query.set('excludeAppointmentId', input.excludeAppointmentId);
  return apiRequest(`/booking-slots?${query.toString()}`, { token });
}

export function createAppointment(
  token: string,
  input: {
    readonly artistId: string;
    readonly confirmedSecondBooking: boolean;
    readonly date: string;
    readonly durationMinutes: BookingDuration;
    readonly hostId: string;
    readonly startMinute: number;
  },
): Promise<unknown> {
  return apiRequest('/appointments', {
    body: input,
    headers: { 'Idempotency-Key': crypto.randomUUID() },
    method: 'POST',
    token,
  });
}

export function rescheduleAppointment(
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
): Promise<unknown> {
  return apiRequest(`/appointments/${appointmentId}/reschedule`, {
    body: input,
    headers: { 'Idempotency-Key': crypto.randomUUID() },
    method: 'POST',
    token,
  });
}

export function listLeaves(token: string): Promise<readonly LeaveRecord[]> {
  return apiRequest('/leaves', { token });
}

export function previewLeave(
  token: string,
  startDate: string,
  endDate: string,
): Promise<{ readonly affectedAppointmentCount: number }> {
  return apiRequest('/leaves/preview', { body: { endDate, startDate }, method: 'POST', token });
}

export function createLeave(
  token: string,
  input: {
    readonly confirmedAffectedAppointmentCount: number;
    readonly endDate: string;
    readonly reason?: string;
    readonly startDate: string;
  },
): Promise<LeaveRecord> {
  return apiRequest('/leaves', { body: input, method: 'POST', token });
}

export function cancelLeave(
  token: string,
  leaveId: string,
  expectedRowVersion: number,
): Promise<void> {
  return apiRequest(`/leaves/${leaveId}/cancel`, {
    body: { expectedRowVersion },
    method: 'POST',
    token,
  });
}

export async function getOwnArtist(token: string): Promise<MobileArtist | null> {
  return (await listArtists(token)).items[0] ?? null;
}

export function getCurrentShift(token: string, artistId: string): Promise<ArtistShift | null> {
  return apiRequest(`/artists/${artistId}/shifts/current`, { token });
}

export function setInitialShift(
  token: string,
  artistId: string,
  definition: ShiftDefinition,
): Promise<ArtistShift> {
  return apiRequest(`/artists/${artistId}/shifts/initial`, {
    body: definition,
    method: 'POST',
    token,
  });
}

export async function getLatestShiftChange(token: string): Promise<ShiftChange | null> {
  const page = await apiRequest<Page<ShiftChange>>('/shift-changes?page=1&pageSize=1', { token });
  return page.items[0] ?? null;
}

export function submitShiftChange(
  token: string,
  artistId: string,
  input: ShiftDefinition & { readonly effectiveFrom: string; readonly reason: string },
): Promise<ShiftChange> {
  return apiRequest(`/artists/${artistId}/shifts/changes`, {
    body: input,
    method: 'POST',
    token,
  });
}

export function withdrawShiftChange(
  token: string,
  requestId: string,
  expectedRowVersion: number,
): Promise<void> {
  return apiRequest(`/shift-changes/${requestId}/withdraw`, {
    body: { expectedRowVersion },
    method: 'POST',
    token,
  });
}

export async function listOvertimes(token: string): Promise<readonly OvertimeRecord[]> {
  return (await apiRequest<Page<OvertimeRecord>>('/overtimes?page=1&pageSize=50', { token })).items;
}

export function createOvertime(
  token: string,
  artistId: string,
  input: Omit<ShiftDefinition, 'workdays'> & {
    readonly overtimeDate: string;
    readonly reason: string;
  },
): Promise<OvertimeRecord> {
  return apiRequest(`/artists/${artistId}/overtimes`, { body: input, method: 'POST', token });
}

export function withdrawOvertime(
  token: string,
  overtimeId: string,
  expectedRowVersion: number,
): Promise<void> {
  return apiRequest(`/overtimes/${overtimeId}/withdraw`, {
    body: { expectedRowVersion },
    method: 'POST',
    token,
  });
}

export function listUnavailablePeriods(token: string): Promise<readonly UnavailablePeriod[]> {
  return apiRequest('/artist-unavailable-periods', { token });
}

export function previewUnavailablePeriod(
  token: string,
  input: {
    readonly endMinute: number;
    readonly startMinute: number;
    readonly unavailableDate: string;
  },
): Promise<{ readonly affectedAppointmentCount: number }> {
  return apiRequest('/artist-unavailable-periods/preview', {
    body: input,
    method: 'POST',
    token,
  });
}

export function createUnavailablePeriod(
  token: string,
  input: {
    readonly confirmedAffectedAppointmentCount: number;
    readonly endMinute: number;
    readonly reason: string;
    readonly startMinute: number;
    readonly unavailableDate: string;
  },
): Promise<UnavailablePeriod> {
  return apiRequest('/artist-unavailable-periods', { body: input, method: 'POST', token });
}

export function cancelUnavailablePeriod(
  token: string,
  periodId: string,
  expectedRowVersion: number,
): Promise<void> {
  return apiRequest(`/artist-unavailable-periods/${periodId}/cancel`, {
    body: { expectedRowVersion },
    method: 'POST',
    token,
  });
}

export function listManagedHosts(token: string, date: string): Promise<Page<ManagedHost>> {
  const query = new URLSearchParams({ asOf: date, page: '1', pageSize: '100' });
  return apiRequest(`/fixed-appointments/managed-hosts?${query.toString()}`, { token });
}

export function listMyFixedRelations(token: string): Promise<readonly MyFixedRelation[]> {
  return apiRequest('/fixed-appointments/my-relations', { token });
}

export function listFixedRequests(token: string): Promise<Page<FixedRequest>> {
  return apiRequest('/fixed-appointments/requests?page=1&pageSize=100', { token });
}

export function getFixedAvailability(
  token: string,
  input: {
    readonly artistId: string;
    readonly currentRuleId?: string;
    readonly durationMinutes: BookingDuration;
    readonly hostId: string;
    readonly requestedStartDate: string;
    readonly weekdays: readonly number[];
  },
): Promise<FixedAvailability> {
  const query = new URLSearchParams({
    artistId: input.artistId,
    durationMinutes: String(input.durationMinutes),
    hostId: input.hostId,
    requestedStartDate: input.requestedStartDate,
    weekdays: input.weekdays.join(','),
  });
  if (input.currentRuleId) query.set('currentRuleId', input.currentRuleId);
  return apiRequest(`/fixed-appointments/availability?${query.toString()}`, { token });
}

export function createFixedRequest(
  token: string,
  input: {
    readonly artistId: string;
    readonly currentRuleId?: string;
    readonly durationMinutes: BookingDuration;
    readonly effectiveFrom: string;
    readonly hostId: string;
    readonly reason: string;
    readonly startMinute: number;
    readonly weekdays: readonly number[];
  },
): Promise<unknown> {
  const path = input.currentRuleId
    ? '/fixed-appointments/requests/change'
    : '/fixed-appointments/requests';
  return apiRequest(path, {
    body: input,
    headers: { 'Idempotency-Key': crypto.randomUUID() },
    method: 'POST',
    token,
  });
}

export function cancelFixedRule(
  token: string,
  input: {
    readonly currentRuleId: string;
    readonly effectiveFrom: string;
    readonly hostId: string;
    readonly reason: string;
  },
): Promise<unknown> {
  return apiRequest('/fixed-appointments/requests/cancel', {
    body: input,
    headers: { 'Idempotency-Key': crypto.randomUUID() },
    method: 'POST',
    token,
  });
}

export function withdrawFixedRequest(
  token: string,
  requestId: string,
  expectedRowVersion: number,
): Promise<void> {
  return apiRequest(`/fixed-appointments/requests/${requestId}/withdraw`, {
    body: { expectedRowVersion },
    method: 'POST',
    token,
  });
}
