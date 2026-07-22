export class AuthRateLimitExceededError extends Error {
  readonly code = 'AUTH_RATE_LIMIT_EXCEEDED';

  constructor(readonly retryAfterSeconds: number) {
    super('The authentication request rate limit was exceeded');
    this.name = 'AuthRateLimitExceededError';
  }
}

export class RateLimitConfigurationError extends Error {
  readonly code = 'RATE_LIMIT_CONFIGURATION_ERROR';

  constructor() {
    super('The authentication rate limiter is not configured');
    this.name = 'RateLimitConfigurationError';
  }
}

export class RateLimitUnavailableError extends Error {
  readonly code = 'RATE_LIMIT_UNAVAILABLE';

  constructor() {
    super('The authentication rate limiter is unavailable');
    this.name = 'RateLimitUnavailableError';
  }
}
