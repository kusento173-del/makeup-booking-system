import type { VerifiedAuthorizationContext } from '../auth/authorization.types';

export interface ArtistUnavailabilityCommandContext extends VerifiedAuthorizationContext {
  readonly actorName: string;
  readonly clientType?: string;
  readonly ipAddress?: string;
  readonly requestId?: string;
  readonly userAgent?: string;
}

export interface ArtistUnavailablePeriodRange {
  readonly artistId?: string;
  readonly endMinute: number;
  readonly startMinute: number;
  readonly unavailableDate: Date;
}

export interface CreateArtistUnavailablePeriodCommand extends ArtistUnavailablePeriodRange {
  readonly confirmedAffectedAppointmentCount: number;
  readonly reason: string;
}

export interface CancelArtistUnavailablePeriodCommand {
  readonly expectedRowVersion: number;
  readonly periodId: string;
  readonly reason?: string;
}

export interface ArtistUnavailablePeriodTarget {
  readonly artistId?: string;
}

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
