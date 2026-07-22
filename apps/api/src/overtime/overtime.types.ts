import type { VerifiedAuthorizationContext } from '../auth/authorization.types';

export interface OvertimeCommandContext extends VerifiedAuthorizationContext {
  readonly actorName: string;
  readonly clientType?: string;
  readonly ipAddress?: string;
  readonly requestId?: string;
  readonly userAgent?: string;
}

export interface OvertimeDefinition {
  readonly breakEndMinute: number | null;
  readonly breakStartMinute: number | null;
  readonly workEndMinute: number;
  readonly workStartMinute: number;
}

export interface SubmitOvertimeCommand extends OvertimeDefinition {
  readonly artistId: string;
  readonly overtimeDate: Date;
  readonly reason: string;
}

export type DirectApproveOvertimeCommand = SubmitOvertimeCommand;

export interface WithdrawOvertimeCommand {
  readonly expectedRowVersion: number;
  readonly overtimeId: string;
}

export interface ReviewOvertimeCommand {
  readonly comment?: string;
  readonly decision: 'APPROVE' | 'REJECT';
  readonly expectedRowVersion: number;
  readonly overtimeId: string;
}

export interface OvertimeSummary extends OvertimeDefinition {
  readonly affectedAppointmentCount: number;
  readonly artistId: string;
  readonly id: string;
  readonly overtimeDate: string;
  readonly reason: string;
  readonly rowVersion: number;
  readonly siteId: string;
  readonly status: 'APPROVED' | 'PENDING' | 'REJECTED' | 'WITHDRAWN';
  readonly submittedAt: string;
}

export interface OvertimeListItem extends OvertimeSummary {
  readonly artistNickname: string;
  readonly reviewComment: string | null;
  readonly reviewedAt: string | null;
}

export interface OvertimePage {
  readonly items: readonly OvertimeListItem[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
}

export interface OvertimePageInput {
  readonly page: number;
  readonly pageSize: number;
  readonly status?: OvertimeSummary['status'];
}
