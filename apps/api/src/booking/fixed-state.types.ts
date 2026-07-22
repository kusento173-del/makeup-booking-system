export interface ActiveFixedRuleSummary {
  readonly artistId: string;
  readonly artistNickname: string;
  readonly durationMinutes: number;
  readonly id: string;
  readonly rowVersion: number;
  readonly startMinute: number;
  readonly validFrom: string;
  readonly weekdays: readonly number[];
}

export interface PendingFixedRequestSummary {
  readonly effectiveFrom: string;
  readonly id: string;
  readonly requestType: 'CANCEL' | 'CHANGE' | 'CREATE';
  readonly rowVersion: number;
  readonly targetArtistId: string | null;
  readonly targetDurationMinutes: number | null;
  readonly targetStartMinute: number | null;
  readonly targetWeekdays: readonly number[];
}

export interface FixedHostState {
  readonly activeRule: ActiveFixedRuleSummary | null;
  readonly hostId: string;
  readonly pendingRequest: PendingFixedRequestSummary | null;
  readonly siteId: string;
}
