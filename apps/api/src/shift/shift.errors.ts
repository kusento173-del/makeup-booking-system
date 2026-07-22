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

export class ShiftChangeNotFoundError extends Error {
  readonly code = 'SHIFT_CHANGE_NOT_FOUND';

  constructor() {
    super('Shift change request was not found');
    this.name = 'ShiftChangeNotFoundError';
  }
}

export class ShiftChangeStateConflictError extends Error {
  readonly code = 'SHIFT_CHANGE_STATE_CONFLICT';

  constructor() {
    super('Shift change request state has changed');
    this.name = 'ShiftChangeStateConflictError';
  }
}

export class ShiftChangeEffectiveDateError extends Error {
  readonly code = 'SHIFT_CHANGE_EFFECTIVE_DATE_INVALID';

  constructor() {
    super('Shift changes must take effect after the current business date');
    this.name = 'ShiftChangeEffectiveDateError';
  }
}

export class ShiftChangeReasonInvalidError extends Error {
  readonly code = 'SHIFT_CHANGE_REASON_INVALID';

  constructor() {
    super('Shift change reason is invalid');
    this.name = 'ShiftChangeReasonInvalidError';
  }
}

export class ShiftChangeNoOpError extends Error {
  readonly code = 'SHIFT_CHANGE_NO_OP';

  constructor() {
    super('The proposed shift is identical to the current shift');
    this.name = 'ShiftChangeNoOpError';
  }
}

export class ShiftChangePendingExistsError extends Error {
  readonly code = 'SHIFT_CHANGE_PENDING_EXISTS';

  constructor() {
    super('The artist already has a pending shift change request');
    this.name = 'ShiftChangePendingExistsError';
  }
}
