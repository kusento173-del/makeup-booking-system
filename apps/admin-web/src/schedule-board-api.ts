import { apiRequest } from './api-client';

export type ScheduleUnavailableReason =
  | 'ARTIST_INACTIVE'
  | 'ARTIST_ON_LEAVE'
  | 'NON_WORKING_DAY'
  | 'SHIFT_NOT_CONFIGURED'
  | 'SITE_INACTIVE';

export interface MinuteInterval {
  readonly endMinute: number;
  readonly startMinute: number;
}

export interface ScheduleAppointment {
  readonly appointmentType: 'FIXED' | 'SINGLE';
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
  readonly status: 'BOOKED' | 'COMPLETED';
}

export interface ScheduleArtist {
  readonly appointments: readonly ScheduleAppointment[];
  readonly artistId: string;
  readonly artistNickname: string;
  readonly availabilitySource: 'APPROVED_OVERTIME' | 'REGULAR_SHIFT' | null;
  readonly available: boolean;
  readonly breakInterval: MinuteInterval | null;
  readonly unavailableReason: ScheduleUnavailableReason | null;
  readonly workIntervals: readonly MinuteInterval[];
}

export interface ScheduleBoard {
  readonly artists: readonly ScheduleArtist[];
  readonly date: string;
  readonly lastUpdatedAt: string;
  readonly siteId: string;
  readonly siteName: string;
}

export function getScheduleBoard(
  token: string,
  date: string,
  siteId?: string,
): Promise<ScheduleBoard> {
  const query = new URLSearchParams({ date });
  if (siteId) {
    query.set('siteId', siteId);
  }
  return apiRequest(`/schedule-board?${query.toString()}`, { token });
}
