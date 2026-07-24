import { apiRequest } from './api-client';

export type FixedRequestType = 'CANCEL' | 'CHANGE' | 'CREATE';

export interface FixedRequest {
  readonly currentRuleId: string | null;
  readonly effectiveFrom: string;
  readonly hostCode: string;
  readonly hostId: string;
  readonly hostName: string;
  readonly id: string;
  readonly reason: string;
  readonly requestType: FixedRequestType;
  readonly reviewComment: string | null;
  readonly rowVersion: number;
  readonly siteName: string;
  readonly status: 'APPROVED' | 'PENDING' | 'REJECTED' | 'WITHDRAWN';
  readonly submittedAt: string;
  readonly submittedByOperatorName: string;
  readonly targetArtistNickname: string | null;
  readonly targetDurationMinutes: number | null;
  readonly targetStartMinute: number | null;
  readonly targetWeekdays: readonly number[];
}

interface FixedRequestPage {
  readonly items: readonly FixedRequest[];
  readonly total: number;
}

export function listPendingFixedRequests(token: string): Promise<FixedRequestPage> {
  return apiRequest('/fixed-appointments/requests?page=1&pageSize=100&status=PENDING', { token });
}

export function reviewFixedRequest(
  token: string,
  request: Pick<FixedRequest, 'id' | 'rowVersion'>,
  decision: 'APPROVE' | 'REJECT',
  comment?: string,
): Promise<void> {
  return apiRequest(`/fixed-appointments/requests/${request.id}/review`, {
    body: {
      decision,
      expectedRowVersion: request.rowVersion,
      ...(comment?.trim() ? { comment: comment.trim() } : {}),
    },
    method: 'POST',
    token,
  });
}
