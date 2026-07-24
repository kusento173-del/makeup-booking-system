import { apiRequest } from './api-client';

export interface OvertimeRequest {
  readonly artistNickname: string;
  readonly breakEndMinute: number | null;
  readonly breakStartMinute: number | null;
  readonly id: string;
  readonly overtimeDate: string;
  readonly reason: string;
  readonly rowVersion: number;
  readonly status: 'APPROVED' | 'PENDING' | 'REJECTED' | 'WITHDRAWN';
  readonly submittedAt: string;
  readonly workEndMinute: number;
  readonly workStartMinute: number;
}

interface OvertimePage {
  readonly items: readonly OvertimeRequest[];
  readonly total: number;
}

export function listPendingOvertimes(token: string): Promise<OvertimePage> {
  return apiRequest('/overtimes?page=1&pageSize=100&status=PENDING', { token });
}

export function reviewOvertime(
  token: string,
  request: Pick<OvertimeRequest, 'id' | 'rowVersion'>,
  decision: 'APPROVE' | 'REJECT',
  comment?: string,
): Promise<void> {
  return apiRequest(`/overtimes/${request.id}/review`, {
    body: {
      decision,
      expectedRowVersion: request.rowVersion,
      ...(comment?.trim() ? { comment: comment.trim() } : {}),
    },
    method: 'POST',
    token,
  });
}
