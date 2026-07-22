import type { UnavailableArtistDay } from '../availability/artist-availability.types';

export class BookingIdempotencyKeyInvalidError extends Error {
  readonly code = 'BOOKING_IDEMPOTENCY_KEY_INVALID';
  constructor() {
    super('Idempotency key is invalid');
    this.name = 'BookingIdempotencyKeyInvalidError';
  }
}

export class BookingIdempotencyConflictError extends Error {
  readonly code = 'BOOKING_IDEMPOTENCY_CONFLICT';
  constructor() {
    super('Idempotency key was already used for another request');
    this.name = 'BookingIdempotencyConflictError';
  }
}

export class BookingIdempotencyIncompleteError extends Error {
  readonly code = 'BOOKING_IDEMPOTENCY_INCOMPLETE';
  constructor() {
    super('The previous request with this idempotency key did not complete');
    this.name = 'BookingIdempotencyIncompleteError';
  }
}

export class BookingHostUnavailableError extends Error {
  readonly code = 'BOOKING_HOST_UNAVAILABLE';
  constructor() {
    super('Host is not eligible for this booking date');
    this.name = 'BookingHostUnavailableError';
  }
}

export class BookingArtistUnavailableError extends Error {
  readonly code = 'BOOKING_ARTIST_UNAVAILABLE';
  constructor(readonly reason: UnavailableArtistDay['reason']) {
    super(`Artist is unavailable: ${reason}`);
    this.name = 'BookingArtistUnavailableError';
  }
}

export class BookingSecondConfirmationRequiredError extends Error {
  readonly code = 'BOOKING_SECOND_CONFIRMATION_REQUIRED';
  constructor() {
    super('The host already has one appointment and must confirm the second booking');
    this.name = 'BookingSecondConfirmationRequiredError';
  }
}

export class BookingDailyLimitReachedError extends Error {
  readonly code = 'BOOKING_DAILY_LIMIT_REACHED';
  constructor() {
    super('A host can have at most two appointments per business date');
    this.name = 'BookingDailyLimitReachedError';
  }
}

export class BookingSlotConflictError extends Error {
  readonly code = 'BOOKING_SLOT_CONFLICT';
  constructor() {
    super('The selected booking interval is no longer available');
    this.name = 'BookingSlotConflictError';
  }
}

export class BookingStateConflictError extends Error {
  readonly code = 'BOOKING_STATE_CONFLICT';
  constructor() {
    super('Related booking data changed and must be refreshed');
    this.name = 'BookingStateConflictError';
  }
}

export class BookingAppointmentNotFoundError extends Error {
  readonly code = 'BOOKING_APPOINTMENT_NOT_FOUND';
  constructor() {
    super('Appointment was not found');
    this.name = 'BookingAppointmentNotFoundError';
  }
}

export class BookingCancellationCutoffError extends Error {
  readonly code = 'BOOKING_CANCELLATION_CUTOFF';
  constructor() {
    super('The appointment can no longer be cancelled by this role');
    this.name = 'BookingCancellationCutoffError';
  }
}

export class BookingCancellationReasonInvalidError extends Error {
  readonly code = 'BOOKING_CANCELLATION_REASON_INVALID';
  constructor() {
    super('Cancellation reason is invalid');
    this.name = 'BookingCancellationReasonInvalidError';
  }
}

export class BookingCreationReasonInvalidError extends Error {
  readonly code = 'BOOKING_CREATION_REASON_INVALID';
  constructor() {
    super('Creation reason is invalid');
    this.name = 'BookingCreationReasonInvalidError';
  }
}
