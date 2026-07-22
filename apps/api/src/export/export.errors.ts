export class ExportRequestInvalidError extends Error {
  readonly code = 'EXPORT_REQUEST_INVALID';

  constructor() {
    super('Export request is invalid');
    this.name = 'ExportRequestInvalidError';
  }
}

export class ExportDateOutOfRangeError extends Error {
  readonly code = 'EXPORT_DATE_OUT_OF_RANGE';

  constructor() {
    super('Export date is outside the allowed range');
    this.name = 'ExportDateOutOfRangeError';
  }
}

export class ExportSiteUnavailableError extends Error {
  readonly code = 'EXPORT_SITE_UNAVAILABLE';

  constructor() {
    super('Export site is unavailable');
    this.name = 'ExportSiteUnavailableError';
  }
}

export class ExportIdempotencyKeyInvalidError extends Error {
  readonly code = 'EXPORT_IDEMPOTENCY_KEY_INVALID';

  constructor() {
    super('Export idempotency key is invalid');
    this.name = 'ExportIdempotencyKeyInvalidError';
  }
}

export class ExportIdempotencyConflictError extends Error {
  readonly code = 'EXPORT_IDEMPOTENCY_CONFLICT';

  constructor() {
    super('Export idempotency key conflicts with another request');
    this.name = 'ExportIdempotencyConflictError';
  }
}

export class ExportStateConflictError extends Error {
  readonly code = 'EXPORT_STATE_CONFLICT';

  constructor() {
    super('Export state conflicts with the requested operation');
    this.name = 'ExportStateConflictError';
  }
}
