export class LeaveDateRangeInvalidError extends Error {
  readonly code = 'LEAVE_DATE_RANGE_INVALID';
  constructor() {
    super('Leave must be within the next seven business dates');
    this.name = 'LeaveDateRangeInvalidError';
  }
}

export class LeaveSubjectUnavailableError extends Error {
  readonly code = 'LEAVE_SUBJECT_UNAVAILABLE';
  constructor() {
    super('Leave subject is unavailable');
    this.name = 'LeaveSubjectUnavailableError';
  }
}

export class LeaveImpactChangedError extends Error {
  readonly code = 'LEAVE_IMPACT_CHANGED';
  constructor() {
    super('Leave impact changed after preview');
    this.name = 'LeaveImpactChangedError';
  }
}

export class LeaveNotFoundError extends Error {
  readonly code = 'LEAVE_NOT_FOUND';
  constructor() {
    super('Leave record was not found');
    this.name = 'LeaveNotFoundError';
  }
}

export class LeaveStateConflictError extends Error {
  readonly code = 'LEAVE_STATE_CONFLICT';
  constructor() {
    super('Leave record state changed');
    this.name = 'LeaveStateConflictError';
  }
}

export class LeaveReasonInvalidError extends Error {
  readonly code = 'LEAVE_REASON_INVALID';
  constructor() {
    super('Leave reason is invalid');
    this.name = 'LeaveReasonInvalidError';
  }
}
