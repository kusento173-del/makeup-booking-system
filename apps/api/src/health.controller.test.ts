import { describe, expect, it, vi } from 'vitest';

import type { DatabaseService } from './database/database.service';
import { HealthController } from './health.controller';
import type { RedisService } from './redis/redis.service';

describe('HealthController', () => {
  it('reports readiness only after the database responds', async () => {
    const database = { assertHealthy: vi.fn().mockResolvedValue(undefined) };
    const redis = { assertHealthy: vi.fn().mockResolvedValue(undefined) };
    const controller = new HealthController(
      database as unknown as DatabaseService,
      redis as unknown as RedisService,
    );

    await expect(controller.check()).resolves.toEqual({
      database: 'ok',
      redis: 'ok',
      service: 'api',
      status: 'ok',
    });
    expect(database.assertHealthy).toHaveBeenCalledOnce();
    expect(redis.assertHealthy).toHaveBeenCalledOnce();
  });
});
