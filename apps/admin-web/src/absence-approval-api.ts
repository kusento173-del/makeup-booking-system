import { apiRequest } from './api-client';
import type { AffectedAppointment } from './mobile-api';

interface ApprovalBase {
  readonly affectedAppointmentCount: number;
  readonly affectedAppointments: readonly AffectedAppointment[];
  readonly artistNickname: string;
  readonly id: string;
  readonly reason: string | null;
  readonly rowVersion: number;
  readonly submittedAt: string;
}

export interface FullDayLeaveApproval extends ApprovalBase {
  readonly endDate: string;
  readonly siteId: string;
  readonly startDate: string;
}

export interface PartialLeaveApproval extends ApprovalBase {
  readonly endMinute: number;
  readonly reason: string;
  readonly siteId: string;
  readonly startMinute: number;
  readonly unavailableDate: string;
}

export interface AbsenceApprovals {
  readonly fullDays: readonly FullDayLeaveApproval[];
  readonly partialDays: readonly PartialLeaveApproval[];
}

export async function listAbsenceApprovals(token: string): Promise<AbsenceApprovals> {
  const [fullDays, partialDays] = await Promise.all([
    apiRequest<readonly FullDayLeaveApproval[]>('/leaves/pending', { token }),
    apiRequest<readonly PartialLeaveApproval[]>('/artist-unavailable-periods/pending', { token }),
  ]);
  return { fullDays, partialDays };
}

interface ReviewInput {
  readonly comment?: string;
  readonly confirmedAffectedAppointmentCount: number;
  readonly decision: 'APPROVE' | 'REJECT';
  readonly expectedRowVersion: number;
}

export function reviewFullDayLeave(
  token: string,
  request: FullDayLeaveApproval,
  decision: ReviewInput['decision'],
  comment?: string,
): Promise<void> {
  return apiRequest(`/leaves/${request.id}/review`, {
    body: {
      ...(comment ? { comment } : {}),
      confirmedAffectedAppointmentCount: request.affectedAppointmentCount,
      decision,
      expectedRowVersion: request.rowVersion,
    },
    method: 'POST',
    token,
  });
}

export function reviewPartialLeave(
  token: string,
  request: PartialLeaveApproval,
  decision: ReviewInput['decision'],
  comment?: string,
): Promise<void> {
  return apiRequest(`/artist-unavailable-periods/${request.id}/review`, {
    body: {
      ...(comment ? { comment } : {}),
      confirmedAffectedAppointmentCount: request.affectedAppointmentCount,
      decision,
      expectedRowVersion: request.rowVersion,
    },
    method: 'POST',
    token,
  });
}
