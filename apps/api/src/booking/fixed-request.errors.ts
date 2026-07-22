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

export class FixedRequestNotFoundError extends Error {
  readonly code = 'FIXED_REQUEST_NOT_FOUND';

  constructor() {
    super('Fixed appointment request was not found');
    this.name = 'FixedRequestNotFoundError';
  }
}

export class FixedRequestReviewCommentInvalidError extends Error {
  readonly code = 'FIXED_REQUEST_REVIEW_COMMENT_INVALID';

  constructor() {
    super('The fixed appointment review comment is invalid');
    this.name = 'FixedRequestReviewCommentInvalidError';
  }
}
