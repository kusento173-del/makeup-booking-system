export class OvertimeArtistNotFoundError extends Error {
  readonly code = 'OVERTIME_ARTIST_NOT_FOUND';
  constructor() {
    super('Overtime artist was not found');
    this.name = 'OvertimeArtistNotFoundError';
  }
}

export class OvertimeArtistUnavailableError extends Error {
  readonly code = 'OVERTIME_ARTIST_UNAVAILABLE';
  constructor() {
    super('Overtime artist is unavailable');
    this.name = 'OvertimeArtistUnavailableError';
  }
}

export class OvertimeDateInvalidError extends Error {
  readonly code = 'OVERTIME_DATE_INVALID';
  constructor() {
    super('Overtime date must be within the next seven business dates');
    this.name = 'OvertimeDateInvalidError';
  }
}

export class OvertimeNotFoundError extends Error {
  readonly code = 'OVERTIME_NOT_FOUND';
  constructor() {
    super('Overtime request was not found');
    this.name = 'OvertimeNotFoundError';
  }
}

export class OvertimePendingExistsError extends Error {
  readonly code = 'OVERTIME_PENDING_EXISTS';
  constructor() {
    super('An active overtime request already exists for this date');
    this.name = 'OvertimePendingExistsError';
  }
}

export class OvertimeReasonInvalidError extends Error {
  readonly code = 'OVERTIME_REASON_INVALID';
  constructor() {
    super('Overtime reason is invalid');
    this.name = 'OvertimeReasonInvalidError';
  }
}

export class OvertimeShiftNotConfiguredError extends Error {
  readonly code = 'OVERTIME_SHIFT_NOT_CONFIGURED';
  constructor() {
    super('No artist shift applies to the overtime date');
    this.name = 'OvertimeShiftNotConfiguredError';
  }
}

export class OvertimeStateConflictError extends Error {
  readonly code = 'OVERTIME_STATE_CONFLICT';
  constructor() {
    super('Overtime request state changed');
    this.name = 'OvertimeStateConflictError';
  }
}

export class OvertimeWorkingDayError extends Error {
  readonly code = 'OVERTIME_WORKING_DAY';
  constructor() {
    super('Overtime is only available on a regular non-working day');
    this.name = 'OvertimeWorkingDayError';
  }
}
