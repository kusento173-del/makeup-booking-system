import type {
  AvailableArtistDay,
  UnavailableArtistDay,
} from '../availability/artist-availability.types';

export interface BookingSlotInput {
  readonly artistId: string;
  readonly date: Date;
  readonly durationMinutes: number;
  readonly excludeAppointmentId?: string;
  readonly hostId: string;
}

export interface BookingSlot {
  readonly endAt: string;
  readonly startAt: string;
  readonly startMinute: number;
}

export type BookingUnavailableReason =
  | UnavailableArtistDay['reason']
  | 'HOST_DAILY_LIMIT_REACHED'
  | 'HOST_INELIGIBLE'
  | 'HOST_ON_LEAVE'
  | 'HOST_SITE_INACTIVE';

export interface BookingSlotResult {
  readonly artistId: string;
  readonly availabilitySource: AvailableArtistDay['source'] | null;
  readonly date: string;
  readonly durationMinutes: number;
  readonly existingAppointmentCount: number;
  readonly hostId: string;
  readonly requiresSecondConfirmation: boolean;
  readonly slots: readonly BookingSlot[];
  readonly unavailableReason: BookingUnavailableReason | null;
}
