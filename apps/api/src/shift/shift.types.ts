import type { VerifiedAuthorizationContext } from '../auth/authorization.types';
import type { ShiftDefinition } from './shift-time';

export interface ShiftCommandContext extends VerifiedAuthorizationContext {
  readonly actorName: string;
  readonly clientType?: string;
  readonly ipAddress?: string;
  readonly requestId?: string;
  readonly userAgent?: string;
}

export interface SetInitialShiftCommand extends ShiftDefinition {
  readonly artistId: string;
}

export interface ArtistShiftSummary extends ShiftDefinition {
  readonly artistId: string;
  readonly id: string;
  readonly siteId: string;
  readonly validFrom: string;
  readonly validUntil: string | null;
  readonly versionNo: number;
}
