export class ShiftArtistNotFoundError extends Error {
  readonly code = 'SHIFT_ARTIST_NOT_FOUND';

  constructor() {
    super('Artist was not found');
    this.name = 'ShiftArtistNotFoundError';
  }
}

export class ShiftArtistUnavailableError extends Error {
  readonly code = 'SHIFT_ARTIST_UNAVAILABLE';

  constructor() {
    super('An inactive artist cannot configure a shift');
    this.name = 'ShiftArtistUnavailableError';
  }
}

export class InitialShiftAlreadyConfiguredError extends Error {
  readonly code = 'INITIAL_SHIFT_ALREADY_CONFIGURED';

  constructor() {
    super('The initial shift has already been configured');
    this.name = 'InitialShiftAlreadyConfiguredError';
  }
}
