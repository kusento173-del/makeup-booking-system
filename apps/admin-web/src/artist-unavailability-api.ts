import { apiRequest } from './api-client';
import type { AffectedAppointment } from './mobile-api';

export interface ArtistUnavailablePeriod {
  readonly affectedAppointmentCount: number;
  readonly affectedAppointments: readonly AffectedAppointment[];
  readonly artistId: string;
  readonly endMinute: number;
  readonly id: string;
  readonly reason: string;
  readonly reviewComment: string | null;
  readonly rowVersion: number;
  readonly siteId: string;
  readonly startMinute: number;
  readonly status: 'ACTIVE' | 'CANCELLED' | 'PENDING' | 'REJECTED';
  readonly unavailableDate: string;
}

export interface ArtistUnavailablePeriodPreview {
  readonly affectedAppointmentCount: number;
  readonly affectedAppointments: readonly AffectedAppointment[];
  readonly artistId: string;
  readonly endMinute: number;
  readonly siteId: string;
  readonly startMinute: number;
  readonly unavailableDate: string;
}

export function listArtistUnavailablePeriods(
  token: string,
  artistId: string,
): Promise<readonly ArtistUnavailablePeriod[]> {
  return apiRequest(`/artist-unavailable-periods?artistId=${encodeURIComponent(artistId)}`, {
    token,
  });
}

export function previewArtistUnavailablePeriod(
  token: string,
  input: {
    readonly artistId: string;
    readonly endMinute: number;
    readonly startMinute: number;
    readonly unavailableDate: string;
  },
): Promise<ArtistUnavailablePeriodPreview> {
  return apiRequest('/artist-unavailable-periods/preview', {
    body: input,
    method: 'POST',
    token,
  });
}

export function createArtistUnavailablePeriod(
  token: string,
  input: {
    readonly artistId: string;
    readonly confirmedAffectedAppointmentCount: number;
    readonly endMinute: number;
    readonly reason: string;
    readonly startMinute: number;
    readonly unavailableDate: string;
  },
): Promise<ArtistUnavailablePeriod> {
  return apiRequest('/artist-unavailable-periods', {
    body: input,
    method: 'POST',
    token,
  });
}

export function cancelArtistUnavailablePeriod(
  token: string,
  periodId: string,
  input: { readonly expectedRowVersion: number; readonly reason: string },
): Promise<void> {
  return apiRequest(`/artist-unavailable-periods/${periodId}/cancel`, {
    body: input,
    method: 'POST',
    token,
  });
}
