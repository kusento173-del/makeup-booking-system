export class AccountLoginDeniedError extends Error {
  readonly code = 'ACCOUNT_LOGIN_DENIED';

  constructor() {
    super('The account is unavailable');
    this.name = 'AccountLoginDeniedError';
  }
}
