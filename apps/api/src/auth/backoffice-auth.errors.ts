export class BackofficeLoginDeniedError extends Error {
  readonly code = 'BACKOFFICE_LOGIN_DENIED';

  constructor() {
    super('The backoffice credentials are invalid or unavailable');
    this.name = 'BackofficeLoginDeniedError';
  }
}
