export class BookingHostNotFoundError extends Error {
  readonly code = 'BOOKING_HOST_NOT_FOUND';
  constructor() {
    super('Booking host was not found');
    this.name = 'BookingHostNotFoundError';
  }
}

export class BookingSiteMismatchError extends Error {
  readonly code = 'BOOKING_SITE_MISMATCH';
  constructor() {
    super('Booking host and artist must belong to the same site');
    this.name = 'BookingSiteMismatchError';
  }
}
