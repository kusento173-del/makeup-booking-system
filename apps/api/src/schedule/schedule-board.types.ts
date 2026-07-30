import type { MinuteInterval } from '../shift/shift-time';

export interface ScheduleBoardInput {
  readonly date: Date;
  readonly siteId?: string;
}

export type ScheduleArtistUnavailableReason =
  | 'ARTIST_INACTIVE'
  | 'ARTIST_ON_LEAVE'
  | 'NON_WORKING_DAY'
  | 'SHIFT_NOT_CONFIGURED'
  | 'SITE_INACTIVE';

export interface ScheduleAppointmentItem {
  readonly appointmentType: 'FIXED' | 'SINGLE';
  readonly cancellationReason: '主播取消' | '主播请假' | '化妆师请假' | null;
  readonly cancellationReasonText: string | null;
  readonly dailySequence: 1 | 2;
  readonly durationMinutes: number;
  readonly endAt: string;
  readonly endMinute: number;
  readonly hostCode: string;
  readonly hostId: string;
  readonly hostName: string;
  readonly id: string;
  readonly operatorId: string | null;
  readonly operatorName: string | null;
  readonly rowVersion: number;
  readonly startAt: string;
  readonly startMinute: number;
  readonly status: 'BOOKED' | 'CANCELLED' | 'COMPLETED';
}

export interface ScheduleArtistRow {
  readonly appointments: readonly ScheduleAppointmentItem[];
  readonly artistId: string;
  readonly artistNickname: string;
  readonly availabilitySource: 'APPROVED_OVERTIME' | 'REGULAR_SHIFT' | null;
  readonly available: boolean;
  readonly breakInterval: MinuteInterval | null;
  readonly unavailablePeriods: readonly MinuteInterval[];
  readonly workIntervals: readonly MinuteInterval[];
  readonly unavailableReason: ScheduleArtistUnavailableReason | null;
}

export interface ScheduleBoard {
  readonly artists: readonly ScheduleArtistRow[];
  readonly date: string;
  readonly lastUpdatedAt: string;
  readonly siteId: string;
  readonly siteName: string;
}
