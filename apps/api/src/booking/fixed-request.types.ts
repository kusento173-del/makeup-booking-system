import type { BookingCommandContext } from './booking-create.types';

export type FixedRequestCommandContext = BookingCommandContext;

export interface CreateFixedRequestCommand {
  readonly artistId: string;
  readonly durationMinutes: number;
  readonly effectiveFrom: Date;
  readonly hostId: string;
  readonly idempotencyKey: string;
  readonly reason: string;
  readonly startMinute: number;
  readonly weekdays: readonly number[];
}

export interface ChangeFixedRequestCommand extends CreateFixedRequestCommand {
  readonly currentRuleId: string;
}

export interface CancelFixedRequestCommand {
  readonly currentRuleId: string;
  readonly effectiveFrom: Date;
  readonly hostId: string;
  readonly idempotencyKey: string;
  readonly reason: string;
}

export type SubmitFixedRequestCommand =
  | ({ readonly requestType: 'CANCEL' } & CancelFixedRequestCommand)
  | ({ readonly requestType: 'CHANGE' } & ChangeFixedRequestCommand)
  | ({ readonly requestType: 'CREATE' } & CreateFixedRequestCommand);

export interface FixedRequestSummary {
  readonly currentRuleId: string | null;
  readonly effectiveFrom: string;
  readonly hostId: string;
  readonly id: string;
  readonly reason: string;
  readonly requestType: 'CANCEL' | 'CHANGE' | 'CREATE';
  readonly rowVersion: number;
  readonly siteId: string;
  readonly status: 'PENDING';
  readonly submittedAt: string;
  readonly submittedByOperatorId: string;
  readonly targetArtistId: string | null;
  readonly targetDurationMinutes: number | null;
  readonly targetStartMinute: number | null;
  readonly targetWeekdays: readonly number[];
}

export interface FixedRequestCreateResult {
  readonly replayed: boolean;
  readonly request: FixedRequestSummary;
}

export type FixedRequestReviewDecision = 'APPROVE' | 'REJECT';

export interface ReviewFixedRequestCommand {
  readonly comment?: string;
  readonly decision: FixedRequestReviewDecision;
  readonly expectedRowVersion: number;
  readonly requestId: string;
}

export interface FixedRequestReviewResult {
  readonly cancelledAppointmentCount: number;
  readonly fixedRuleId: string | null;
  readonly id: string;
  readonly reviewComment: string | null;
  readonly reviewedAt: string;
  readonly rowVersion: number;
  readonly status: 'APPROVED' | 'REJECTED';
}
