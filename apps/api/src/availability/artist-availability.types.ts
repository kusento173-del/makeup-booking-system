import type { MinuteInterval } from '../shift/shift-time';

interface AvailabilityBase {
  readonly artistId: string;
  readonly date: string;
  readonly siteId: string;
}

export interface AvailableArtistDay extends AvailabilityBase {
  readonly available: true;
  readonly intervals: readonly MinuteInterval[];
  readonly overtimeId: string | null;
  readonly shiftTemplateId: string;
  readonly source: 'APPROVED_OVERTIME' | 'REGULAR_SHIFT';
}

export interface UnavailableArtistDay extends AvailabilityBase {
  readonly available: false;
  readonly intervals: readonly [];
  readonly reason:
    | 'ARTIST_INACTIVE'
    | 'ARTIST_ON_LEAVE'
    | 'NON_WORKING_DAY'
    | 'SHIFT_NOT_CONFIGURED'
    | 'SITE_INACTIVE';
}

export type ArtistDayAvailability = AvailableArtistDay | UnavailableArtistDay;
