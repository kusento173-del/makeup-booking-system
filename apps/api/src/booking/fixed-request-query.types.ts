export type FixedRequestType = 'CANCEL' | 'CHANGE' | 'CREATE';
export type FixedRequestStatus = 'APPROVED' | 'PENDING' | 'REJECTED' | 'WITHDRAWN';

export interface FixedRequestListInput {
  readonly page: number;
  readonly pageSize: number;
  readonly requestType?: FixedRequestType;
  readonly status?: FixedRequestStatus;
}

export interface FixedRequestListItem {
  readonly currentRuleId: string | null;
  readonly effectiveFrom: string;
  readonly hostCode: string;
  readonly hostId: string;
  readonly hostName: string;
  readonly id: string;
  readonly reason: string;
  readonly requestType: FixedRequestType;
  readonly reviewComment: string | null;
  readonly reviewedAt: string | null;
  readonly rowVersion: number;
  readonly siteId: string;
  readonly siteName: string;
  readonly status: FixedRequestStatus;
  readonly submittedAt: string;
  readonly submittedByOperatorId: string;
  readonly submittedByOperatorName: string;
  readonly targetArtistId: string | null;
  readonly targetArtistNickname: string | null;
  readonly targetDurationMinutes: number | null;
  readonly targetStartMinute: number | null;
  readonly targetWeekdays: readonly number[];
}

export interface FixedRequestPage {
  readonly items: readonly FixedRequestListItem[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
}
