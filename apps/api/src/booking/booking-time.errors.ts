export class BookingDateInvalidError extends Error {
  readonly code = 'BOOKING_DATE_INVALID';
  constructor() {
    super('Booking date must be within the next seven business dates');
    this.name = 'BookingDateInvalidError';
  }
}

export class BookingDurationInvalidError extends Error {
  readonly code = 'BOOKING_DURATION_INVALID';
  constructor() {
    super('Booking duration must be 15, 30, 45 or 60 minutes');
    this.name = 'BookingDurationInvalidError';
  }
}
