export class AvailabilityArtistNotFoundError extends Error {
  readonly code = 'AVAILABILITY_ARTIST_NOT_FOUND';
  constructor() {
    super('Availability artist was not found');
    this.name = 'AvailabilityArtistNotFoundError';
  }
}

export class AvailabilityDateInvalidError extends Error {
  readonly code = 'AVAILABILITY_DATE_INVALID';
  constructor() {
    super('Availability date must be a date-only value');
    this.name = 'AvailabilityDateInvalidError';
  }
}
