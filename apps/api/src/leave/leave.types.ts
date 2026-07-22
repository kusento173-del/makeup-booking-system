import type { VerifiedAuthorizationContext } from '../auth/authorization.types';

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
  readonly endDate: string;
  readonly startDate: string;
  readonly subjectId: string;
  readonly subjectType: 'ARTIST' | 'HOST';
}

export interface LeaveSummary extends LeaveImpactPreview {
  readonly id: string;
  readonly reason: string | null;
  readonly rowVersion: number;
  readonly status: 'ACTIVE' | 'CANCELLED';
}
