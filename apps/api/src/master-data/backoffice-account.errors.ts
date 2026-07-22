export class BackofficeAccountNotFoundError extends Error {
  readonly code = 'BACKOFFICE_ACCOUNT_NOT_FOUND';

  constructor() {
    super('The backoffice account or role was not found');
    this.name = 'BackofficeAccountNotFoundError';
  }
}

export class BackofficeAccountConflictError extends Error {
  readonly code = 'BACKOFFICE_ACCOUNT_CONFLICT';

  constructor() {
    super('The backoffice account state conflicts with this operation');
    this.name = 'BackofficeAccountConflictError';
  }
}

export class LastAdministratorError extends Error {
  readonly code = 'LAST_ADMINISTRATOR_REQUIRED';

  constructor() {
    super('The last active administrator cannot be disabled or revoked');
    this.name = 'LastAdministratorError';
  }
}
