import { apiRequest } from './api-client';

export interface LeaveSummary {
  readonly affectedAppointmentCount: number;
  readonly endDate: string;
  readonly id: string;
  readonly reason: string | null;
  readonly rowVersion: number;
  readonly startDate: string;
  readonly status: 'ACTIVE' | 'CANCELLED';
  readonly subjectId: string;
  readonly subjectType: 'ARTIST' | 'HOST';
}

export interface LeavePreview {
  readonly affectedAppointmentCount: number;
  readonly endDate: string;
  readonly startDate: string;
  readonly subjectId: string;
  readonly subjectType: 'ARTIST' | 'HOST';
}

export function listOwnLeaves(token: string): Promise<readonly LeaveSummary[]> {
  return apiRequest('/leaves', { token });
}

export function previewLeave(
  token: string,
  input: { readonly endDate: string; readonly startDate: string },
): Promise<LeavePreview> {
  return apiRequest('/leaves/preview', { body: input, method: 'POST', token });
}

export function createLeave(
  token: string,
  input: {
    readonly confirmedAffectedAppointmentCount: number;
    readonly endDate: string;
    readonly reason?: string;
    readonly startDate: string;
  },
): Promise<LeaveSummary> {
  return apiRequest('/leaves', { body: input, method: 'POST', token });
}

export function cancelLeave(
  token: string,
  leaveId: string,
  expectedRowVersion: number,
): Promise<void> {
  return apiRequest(`/leaves/${leaveId}/cancel`, {
    body: { expectedRowVersion },
    method: 'POST',
    token,
  });
}
