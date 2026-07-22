import { createClient } from 'redis';

import { RateLimitConfigurationError } from '../auth/auth-rate-limit.errors';

export type RedisClient = ReturnType<typeof createClient>;

export function provideRedisClient(): RedisClient {
  const url = process.env['REDIS_URL'];

  if (!url) {
    throw new RateLimitConfigurationError();
  }

  return createClient({ url });
}
