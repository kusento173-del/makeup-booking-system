import { apiRequest } from './api-client';

export interface ArtistUnavailablePeriodPreview {
  readonly affectedAppointmentCount: number;
  readonly artistId: string;
  readonly endMinute: number;
  readonly siteId: string;
  readonly startMinute: number;
  readonly unavailableDate: string;
}

export interface ArtistUnavailablePeriodSummary extends ArtistUnavailablePeriodPreview {
  readonly id: string;
  readonly reason: string;
  readonly rowVersion: number;
  readonly status: 'ACTIVE' | 'CANCELLED';
}

export interface ArtistUnavailablePeriodInput {
  readonly endMinute: number;
  readonly startMinute: number;
  readonly unavailableDate: string;
}

export function listOwnUnavailablePeriods(
  token: string,
): Promise<readonly ArtistUnavailablePeriodSummary[]> {
  return apiRequest('/artist-unavailable-periods', { token });
}

export function previewUnavailablePeriod(
  token: string,
  input: ArtistUnavailablePeriodInput,
): Promise<ArtistUnavailablePeriodPreview> {
  return apiRequest('/artist-unavailable-periods/preview', {
    body: input,
    method: 'POST',
    token,
  });
}

export function createUnavailablePeriod(
  token: string,
  input: ArtistUnavailablePeriodInput & {
    readonly confirmedAffectedAppointmentCount: number;
    readonly reason: string;
  },
): Promise<ArtistUnavailablePeriodSummary> {
  return apiRequest('/artist-unavailable-periods', {
    body: input,
    method: 'POST',
    token,
  });
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
