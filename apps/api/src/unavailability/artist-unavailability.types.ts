import type { VerifiedAuthorizationContext } from '../auth/authorization.types';
import type { AffectedAppointmentSummary } from '../absence/affected-appointment';

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
  readonly affectedAppointments: readonly AffectedAppointmentSummary[];
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
  readonly reviewComment: string | null;
  readonly status: 'ACTIVE' | 'CANCELLED' | 'PENDING' | 'REJECTED';
}

export interface ArtistUnavailablePeriodApprovalItem extends ArtistUnavailablePeriodSummary {
  readonly artistNickname: string;
  readonly submittedAt: string;
}

export interface ArtistUnavailablePeriodReviewedItem extends ArtistUnavailablePeriodApprovalItem {
  readonly reviewedAt: string;
}

export interface ReviewArtistUnavailablePeriodCommand {
  readonly comment?: string;
  readonly confirmedAffectedAppointmentCount: number;
  readonly decision: 'APPROVE' | 'REJECT';
  readonly expectedRowVersion: number;
  readonly periodId: string;
}
