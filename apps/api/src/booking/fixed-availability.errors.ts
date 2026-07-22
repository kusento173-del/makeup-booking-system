export class FixedAvailabilityDateInvalidError extends Error {
  readonly code = 'FIXED_AVAILABILITY_DATE_INVALID';

  constructor() {
    super('The fixed appointment start date must be after today');
    this.name = 'FixedAvailabilityDateInvalidError';
  }
}

export class FixedAvailabilityWeekdaysInvalidError extends Error {
  readonly code = 'FIXED_AVAILABILITY_WEEKDAYS_INVALID';

  constructor() {
    super('Fixed appointment weekdays are invalid');
    this.name = 'FixedAvailabilityWeekdaysInvalidError';
  }
}
