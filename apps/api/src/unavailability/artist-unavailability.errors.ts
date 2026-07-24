export class ArtistUnavailablePeriodDateInvalidError extends Error {
  readonly code = 'ARTIST_UNAVAILABLE_PERIOD_DATE_INVALID';

  constructor() {
    super('The unavailable period date is outside the allowed range');
    this.name = 'ArtistUnavailablePeriodDateInvalidError';
  }
}

export class ArtistUnavailablePeriodImpactChangedError extends Error {
  readonly code = 'ARTIST_UNAVAILABLE_PERIOD_IMPACT_CHANGED';

  constructor() {
    super('The unavailable period impact changed after preview');
    this.name = 'ArtistUnavailablePeriodImpactChangedError';
  }
}

export class ArtistUnavailablePeriodNotFoundError extends Error {
  readonly code = 'ARTIST_UNAVAILABLE_PERIOD_NOT_FOUND';

  constructor() {
    super('The unavailable period was not found');
    this.name = 'ArtistUnavailablePeriodNotFoundError';
  }
}

export class ArtistUnavailablePeriodReasonInvalidError extends Error {
  readonly code = 'ARTIST_UNAVAILABLE_PERIOD_REASON_INVALID';

  constructor() {
    super('The unavailable period reason is invalid');
    this.name = 'ArtistUnavailablePeriodReasonInvalidError';
  }
}

export class ArtistUnavailablePeriodScheduleConflictError extends Error {
  readonly code = 'ARTIST_UNAVAILABLE_PERIOD_SCHEDULE_CONFLICT';

  constructor() {
    super('The unavailable period is outside the effective working intervals');
    this.name = 'ArtistUnavailablePeriodScheduleConflictError';
  }
}

export class ArtistUnavailablePeriodStateConflictError extends Error {
  readonly code = 'ARTIST_UNAVAILABLE_PERIOD_STATE_CONFLICT';

  constructor() {
    super('The unavailable period state changed');
    this.name = 'ArtistUnavailablePeriodStateConflictError';
  }
}

export class ArtistUnavailablePeriodTargetInvalidError extends Error {
  readonly code = 'ARTIST_UNAVAILABLE_PERIOD_TARGET_INVALID';

  constructor() {
    super('The unavailable period target is invalid');
    this.name = 'ArtistUnavailablePeriodTargetInvalidError';
  }
}
