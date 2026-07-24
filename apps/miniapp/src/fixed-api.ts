import { apiRequest } from './api-client';
import type { BookingDuration, Page } from './booking-api';

export type FixedRequestType = 'CANCEL' | 'CHANGE' | 'CREATE';
export type FixedRequestStatus = 'APPROVED' | 'PENDING' | 'REJECTED' | 'WITHDRAWN';

export interface ActiveFixedRule {
  readonly artistId: string;
  readonly artistNickname: string;
  readonly durationMinutes: number;
  readonly id: string;
  readonly rowVersion: number;
  readonly startMinute: number;
  readonly validFrom: string;
  readonly weekdays: readonly number[];
}

export interface PendingFixedRequest {
  readonly effectiveFrom: string;
  readonly id: string;
  readonly requestType: FixedRequestType;
  readonly rowVersion: number;
  readonly targetArtistId: string | null;
  readonly targetDurationMinutes: number | null;
  readonly targetStartMinute: number | null;
  readonly targetWeekdays: readonly number[];
}

export interface FixedHostState {
  readonly activeRule: ActiveFixedRule | null;
  readonly hostId: string;
  readonly pendingRequest: PendingFixedRequest | null;
  readonly siteId: string;
}

export interface FixedAvailabilitySlot {
  readonly available: boolean;
  readonly earliestStartDate: string | null;
  readonly endMinute: number;
  readonly fixedConflictWeekdays: readonly number[];
  readonly singleConflictDates: readonly string[];
  readonly startMinute: number;
  readonly unavailablePeriodConflictDates: readonly string[];
}

export interface FixedAvailabilityResult {
  readonly artistId: string;
  readonly artistLeaveDates: readonly string[];
  readonly durationMinutes: number;
  readonly hostId: string;
  readonly hostLeaveDates: readonly string[];
  readonly requestedStartDate: string;
  readonly slots: readonly FixedAvailabilitySlot[];
  readonly unavailableReason: string | null;
  readonly weekdays: readonly number[];
}

export interface FixedRequestItem {
  readonly currentRuleId: string | null;
  readonly effectiveFrom: string;
  readonly hostCode: string;
  readonly hostId: string;
  readonly hostName: string;
  readonly id: string;
  readonly reason: string;
  readonly requestType: FixedRequestType;
  readonly reviewComment: string | null;
  readonly reviewedAt: string | null;
  readonly rowVersion: number;
  readonly siteId: string;
  readonly siteName: string;
  readonly status: FixedRequestStatus;
  readonly submittedAt: string;
  readonly submittedByOperatorId: string;
  readonly submittedByOperatorName: string;
  readonly targetArtistId: string | null;
  readonly targetArtistNickname: string | null;
  readonly targetDurationMinutes: number | null;
  readonly targetStartMinute: number | null;
  readonly targetWeekdays: readonly number[];
}

export interface FixedRequestResult {
  readonly replayed: boolean;
  readonly request: {
    readonly id: string;
    readonly rowVersion: number;
    readonly status: 'PENDING';
  };
}

interface FixedScheduleInput {
  readonly artistId: string;
  readonly durationMinutes: BookingDuration;
  readonly effectiveFrom: string;
  readonly hostId: string;
  readonly reason: string;
  readonly startMinute: number;
  readonly weekdays: readonly number[];
}

export function getFixedHostState(token: string, hostId: string): Promise<FixedHostState> {
  return apiRequest(`/fixed-appointments/hosts/${hostId}/state`, { token });
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
): Promise<FixedAvailabilityResult> {
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

export function listFixedRequests(token: string): Promise<Page<FixedRequestItem>> {
  return apiRequest('/fixed-appointments/requests?page=1&pageSize=100', { token });
}

export function createFixedRequest(
  token: string,
  input: FixedScheduleInput,
  idempotencyKey: string,
): Promise<FixedRequestResult> {
  return submitFixedRequest(token, '/fixed-appointments/requests', input, idempotencyKey);
}

export function changeFixedRequest(
  token: string,
  input: FixedScheduleInput & { readonly currentRuleId: string },
  idempotencyKey: string,
): Promise<FixedRequestResult> {
  return submitFixedRequest(token, '/fixed-appointments/requests/change', input, idempotencyKey);
}

export function cancelFixedRequest(
  token: string,
  input: {
    readonly currentRuleId: string;
    readonly effectiveFrom: string;
    readonly hostId: string;
    readonly reason: string;
  },
  idempotencyKey: string,
): Promise<FixedRequestResult> {
  return submitFixedRequest(token, '/fixed-appointments/requests/cancel', input, idempotencyKey);
}

export function withdrawFixedRequest(
  token: string,
  requestId: string,
  expectedRowVersion: number,
): Promise<{ readonly id: string; readonly rowVersion: number; readonly status: 'WITHDRAWN' }> {
  return apiRequest(`/fixed-appointments/requests/${requestId}/withdraw`, {
    body: { expectedRowVersion },
    method: 'POST',
    token,
  });
}

function submitFixedRequest<T>(
  token: string,
  path: string,
  body: T,
  idempotencyKey: string,
): Promise<FixedRequestResult> {
  return apiRequest(path, {
    body,
    headers: { 'Idempotency-Key': idempotencyKey },
    method: 'POST',
    token,
  });
}
