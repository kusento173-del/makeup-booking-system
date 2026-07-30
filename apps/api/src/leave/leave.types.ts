import type { VerifiedAuthorizationContext } from '../auth/authorization.types';
import type { AffectedAppointmentSummary } from '../absence/affected-appointment';

export interface LeaveCommandContext extends VerifiedAuthorizationContext {
  readonly actorName: string;
  readonly clientType?: string;
  readonly ipAddress?: string;
  readonly requestId?: string;
  readonly userAgent?: string;
}

export interface LeaveDateRange {
  readonly endDate: Date;
  readonly startDate: Date;
}

export interface CreateLeaveCommand extends LeaveDateRange {
  readonly confirmedAffectedAppointmentCount: number;
  readonly reason?: string;
}

export interface CancelLeaveCommand {
  readonly expectedRowVersion: number;
  readonly leaveId: string;
  readonly reason?: string;
}

export interface LeaveImpactPreview {
  readonly affectedAppointmentCount: number;
  readonly affectedAppointments: readonly AffectedAppointmentSummary[];
  readonly endDate: string;
  readonly startDate: string;
  readonly subjectId: string;
  readonly subjectType: 'ARTIST' | 'HOST';
}

export interface LeaveSummary extends LeaveImpactPreview {
  readonly id: string;
  readonly reason: string | null;
  readonly rowVersion: number;
  readonly reviewComment: string | null;
  readonly status: 'ACTIVE' | 'CANCELLED' | 'PENDING' | 'REJECTED';
}

export interface LeaveApprovalItem extends LeaveSummary {
  readonly artistNickname: string;
  readonly siteId: string;
  readonly submittedAt: string;
}

export interface ReviewLeaveCommand {
  readonly comment?: string;
  readonly confirmedAffectedAppointmentCount: number;
  readonly decision: 'APPROVE' | 'REJECT';
  readonly expectedRowVersion: number;
  readonly leaveId: string;
}
