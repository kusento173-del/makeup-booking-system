export type FixedGenerationSkipReason =
  | 'ALREADY_PROCESSED'
  | 'ARTIST_UNAVAILABLE'
  | 'HOST_DAILY_LIMIT'
  | 'HOST_UNAVAILABLE'
  | 'SLOT_CONFLICT';

export interface FixedGenerationResult {
  readonly generated: number;
  readonly skipped: Readonly<Record<FixedGenerationSkipReason, number>>;
  readonly windowFrom: string;
  readonly windowThrough: string;
}
