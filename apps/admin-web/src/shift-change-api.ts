import { apiRequest } from './api-client';

export interface ShiftChange {
  readonly artistNickname: string;
  readonly breakEndMinute: number | null;
  readonly breakStartMinute: number | null;
  readonly effectiveFrom: string;
  readonly id: string;
  readonly reason: string;
  readonly rowVersion: number;
  readonly status: 'APPROVED' | 'PENDING' | 'REJECTED' | 'WITHDRAWN';
  readonly submittedAt: string;
  readonly workEndMinute: number;
  readonly workStartMinute: number;
  readonly workdays: readonly number[];
}

interface ShiftChangePage {
  readonly items: readonly ShiftChange[];
  readonly total: number;
}

export function listPendingShiftChanges(token: string): Promise<ShiftChangePage> {
  return apiRequest('/shift-changes?page=1&pageSize=100&status=PENDING', { token });
}

export function reviewShiftChange(
  token: string,
  request: Pick<ShiftChange, 'id' | 'rowVersion'>,
  decision: 'APPROVE' | 'REJECT',
  comment?: string,
): Promise<void> {
  return apiRequest(`/shift-changes/${request.id}/review`, {
    body: {
      decision,
      expectedRowVersion: request.rowVersion,
      ...(comment?.trim() ? { comment: comment.trim() } : {}),
    },
    method: 'POST',
    token,
  });
}
