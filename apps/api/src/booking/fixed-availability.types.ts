export interface FixedAvailabilityInput {
  readonly artistId: string;
  readonly durationMinutes: number;
  readonly hostId: string;
  readonly requestedStartDate: Date;
  readonly weekdays: readonly number[];
}

export type FixedAvailabilityUnavailableReason =
  | 'ARTIST_INACTIVE'
  | 'HOST_HAS_ACTIVE_FIXED_RULE'
  | 'HOST_HAS_PENDING_FIXED_REQUEST'
  | 'HOST_INELIGIBLE'
  | 'NO_STABLE_TIME_SLOT'
  | 'NON_WORKING_WEEKDAY'
  | 'SHIFT_NOT_CONFIGURED'
  | 'SITE_INACTIVE';

export interface FixedAvailabilitySlot {
  readonly available: boolean;
  readonly earliestStartDate: string | null;
  readonly endMinute: number;
  readonly fixedConflictWeekdays: readonly number[];
  readonly singleConflictDates: readonly string[];
  readonly startMinute: number;
}

export interface FixedAvailabilityResult {
  readonly artistId: string;
  readonly artistLeaveDates: readonly string[];
  readonly durationMinutes: number;
  readonly hostId: string;
  readonly hostLeaveDates: readonly string[];
  readonly requestedStartDate: string;
  readonly slots: readonly FixedAvailabilitySlot[];
  readonly unavailableReason: FixedAvailabilityUnavailableReason | null;
  readonly weekdays: readonly number[];
}
