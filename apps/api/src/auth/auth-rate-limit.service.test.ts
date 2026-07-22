import { describe, expect, it, vi } from 'vitest';

import type { RedisService } from '../redis/redis.service';
import { AuthRateLimitExceededError, RateLimitUnavailableError } from './auth-rate-limit.errors';
import { AuthRateLimitService } from './auth-rate-limit.service';

describe('AuthRateLimitService', () => {
  it('uses an anonymized Redis key and allows requests inside the shared limit', async () => {
    const evaluate = vi
      .fn<(script: string, keys: readonly string[], args: readonly string[]) => Promise<unknown>>()
      .mockResolvedValue([3, 240]);
    const service = new AuthRateLimitService({ evaluate } as unknown as RedisService);

    await expect(service.assertAllowed('wechat-login-ip', '203.0.113.8', 600, 300)).resolves.toBe(
      undefined,
    );
    const call = evaluate.mock.calls[0];
    expect(call?.[0]).toContain("redis.call('INCR'");
    expect(call?.[1][0]).toMatch(/^auth-rate:wechat-login-ip:[0-9a-f]{64}$/);
    expect(call?.[2]).toEqual(['300']);
    expect(JSON.stringify(evaluate.mock.calls)).not.toContain('203.0.113.8');
  });

  it('returns the Redis window TTL when the limit is exceeded', async () => {
    const evaluate = vi.fn().mockResolvedValue([601, 173]);
    const service = new AuthRateLimitService({ evaluate } as unknown as RedisService);

    await expect(service.assertAllowed('wechat-login-ip', '203.0.113.8', 600, 300)).rejects.toEqual(
      new AuthRateLimitExceededError(173),
    );
  });

  it('fails closed when Redis cannot enforce a consistent limit', async () => {
    const evaluate = vi.fn().mockRejectedValue(new Error('connection lost'));
    const service = new AuthRateLimitService({ evaluate } as unknown as RedisService);

    await expect(
      service.assertAllowed('wechat-login-ip', '203.0.113.8', 600, 300),
    ).rejects.toBeInstanceOf(RateLimitUnavailableError);
  });
});
