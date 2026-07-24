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

export type ManagedHostBookingAvailability =
  'AVAILABLE' | 'ON_LEAVE' | 'QUALIFICATION_BLOCKED' | 'SITE_INACTIVE';

export interface ManagedHostListInput {
  readonly asOf: Date;
  readonly hostId?: string;
  readonly page: number;
  readonly pageSize: number;
  readonly search?: string;
}

export interface ManagedHostSummary {
  readonly activeRule: ActiveFixedRuleSummary | null;
  readonly bookingAvailability: ManagedHostBookingAvailability;
  readonly hostCode: string;
  readonly hostId: string;
  readonly hostName: string;
  readonly pendingRequest: PendingFixedRequestSummary | null;
  readonly qualificationStatus: 'ACTIVE' | 'CANCELLED' | 'SUSPENDED';
  readonly siteId: string;
  readonly siteName: string;
}

export interface ManagedHostPage {
  readonly items: readonly ManagedHostSummary[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
}

export interface MyFixedRelationSummary {
  readonly artistId: string;
  readonly artistNickname: string;
  readonly durationMinutes: number;
  readonly hostCode: string;
  readonly hostId: string;
  readonly hostName: string;
  readonly id: string;
  readonly siteId: string;
  readonly siteName: string;
  readonly startMinute: number;
  readonly validFrom: string;
  readonly validUntil: string | null;
  readonly weekdays: readonly number[];
}
