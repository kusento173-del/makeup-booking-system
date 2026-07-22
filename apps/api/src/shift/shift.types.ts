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

export interface SubmitShiftChangeCommand extends ShiftDefinition {
  readonly artistId: string;
  readonly effectiveFrom: Date;
  readonly reason: string;
}

export interface WithdrawShiftChangeCommand {
  readonly expectedRowVersion: number;
  readonly requestId: string;
}

export interface ReviewShiftChangeCommand {
  readonly comment?: string;
  readonly decision: 'APPROVE' | 'REJECT';
  readonly expectedRowVersion: number;
  readonly requestId: string;
}

export interface DirectShiftChangeCommand extends ShiftDefinition {
  readonly artistId: string;
  readonly effectiveFrom: Date;
  readonly expectedVersionNo: number;
  readonly reason: string;
}

export interface ShiftChangeSummary extends ShiftDefinition {
  readonly artistId: string;
  readonly effectiveFrom: string;
  readonly id: string;
  readonly reason: string;
  readonly rowVersion: number;
  readonly siteId: string;
  readonly status: 'APPROVED' | 'PENDING' | 'REJECTED' | 'WITHDRAWN';
  readonly submittedAt: string;
}

export interface ShiftChangeListItem extends ShiftChangeSummary {
  readonly artistNickname: string;
  readonly reviewComment: string | null;
  readonly reviewedAt: string | null;
}

export interface ShiftChangePage {
  readonly items: readonly ShiftChangeListItem[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
}

export interface ShiftChangePageInput {
  readonly page: number;
  readonly pageSize: number;
  readonly status?: ShiftChangeSummary['status'];
}
