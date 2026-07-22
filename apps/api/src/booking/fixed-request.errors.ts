export class FixedRequestReasonInvalidError extends Error {
  readonly code = 'FIXED_REQUEST_REASON_INVALID';

  constructor() {
    super('The fixed appointment request reason is invalid');
    this.name = 'FixedRequestReasonInvalidError';
  }
}

export class FixedRequestUnavailableError extends Error {
  readonly code = 'FIXED_REQUEST_UNAVAILABLE';

  constructor() {
    super('The selected fixed appointment slot is no longer available');
    this.name = 'FixedRequestUnavailableError';
  }
}

export class FixedRequestStateConflictError extends Error {
  readonly code = 'FIXED_REQUEST_STATE_CONFLICT';

  constructor() {
    super('Fixed appointment request data changed and must be refreshed');
    this.name = 'FixedRequestStateConflictError';
  }
}
