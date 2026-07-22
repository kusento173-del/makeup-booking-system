import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { RedisService } from '../redis/redis.service';
import { AuthRateLimitExceededError, RateLimitUnavailableError } from './auth-rate-limit.errors';

const CONSUME_SCRIPT = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return { current, redis.call('TTL', KEYS[1]) }
`;

@Injectable()
export class AuthRateLimitService {
  constructor(private readonly redis: RedisService) {}

  async assertAllowed(
    scope: string,
    identifier: string,
    limit: number,
    windowSeconds: number,
  ): Promise<void> {
    let result: unknown;

    try {
      result = await this.redis.evaluate(
        CONSUME_SCRIPT,
        [`auth-rate:${scope}:${this.hash(identifier)}`],
        [String(windowSeconds)],
      );
    } catch {
      throw new RateLimitUnavailableError();
    }

    if (!this.isCounterResult(result)) {
      throw new RateLimitUnavailableError();
    }

    const [count, ttl] = result;

    if (count > limit) {
      throw new AuthRateLimitExceededError(Math.max(ttl, 1));
    }
  }

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private isCounterResult(value: unknown): value is [number, number] {
    return (
      Array.isArray(value) &&
      value.length === 2 &&
      typeof value[0] === 'number' &&
      typeof value[1] === 'number'
    );
  }
}
