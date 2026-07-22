export class AuthConfigurationError extends Error {
  readonly code = 'AUTH_CONFIGURATION_ERROR';

  constructor() {
    super('Authentication secrets are not configured securely');
    this.name = 'AuthConfigurationError';
  }
}

export class AuthSessionInvalidError extends Error {
  readonly code = 'AUTH_SESSION_INVALID';

  constructor() {
    super('The authentication session is invalid or unavailable');
    this.name = 'AuthSessionInvalidError';
  }
}
