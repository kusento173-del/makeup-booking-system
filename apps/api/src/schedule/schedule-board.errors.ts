export class ScheduleRequestInvalidError extends Error {
  readonly code = 'SCHEDULE_REQUEST_INVALID';

  constructor() {
    super('The schedule board request is invalid');
    this.name = 'ScheduleRequestInvalidError';
  }
}

export class ScheduleSiteRequiredError extends Error {
  readonly code = 'SCHEDULE_SITE_REQUIRED';

  constructor() {
    super('Administrators must select a site');
    this.name = 'ScheduleSiteRequiredError';
  }
}

export class ScheduleDateOutOfRangeError extends Error {
  readonly code = 'SCHEDULE_DATE_OUT_OF_RANGE';

  constructor() {
    super('Future schedule dates are limited to the next seven days');
    this.name = 'ScheduleDateOutOfRangeError';
  }
}
