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

export interface FixedRequestSummary {
  readonly effectiveFrom: string;
  readonly hostId: string;
  readonly id: string;
  readonly reason: string;
  readonly requestType: 'CREATE';
  readonly rowVersion: number;
  readonly siteId: string;
  readonly status: 'PENDING';
  readonly submittedAt: string;
  readonly submittedByOperatorId: string;
  readonly targetArtistId: string;
  readonly targetDurationMinutes: number;
  readonly targetStartMinute: number;
  readonly targetWeekdays: readonly number[];
}

export interface FixedRequestCreateResult {
  readonly replayed: boolean;
  readonly request: FixedRequestSummary;
}
