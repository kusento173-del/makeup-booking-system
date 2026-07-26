import { createClient } from 'redis';

import { RateLimitConfigurationError } from '../auth/auth-rate-limit.errors';

export type RedisClient = ReturnType<typeof createClient>;

export function provideRedisClient(): RedisClient {
  const url = process.env['REDIS_URL'];

  if (!url) {
    throw new RateLimitConfigurationError();
  }

  return createClient({
    disableOfflineQueue: true,
    socket: {
      reconnectStrategy: (retries: number) => Math.min(100 * 2 ** Math.min(retries, 5), 3_000),
    },
    url,
  });
}
