import { EventEmitter } from 'node:events';

import { describe, expect, it, vi } from 'vitest';

import type { RedisClient } from './redis-client.provider';
import { RedisService } from './redis.service';

function client() {
  const events = new EventEmitter();
  return Object.assign(events, {
    connect: vi.fn().mockResolvedValue(undefined),
    eval: vi.fn().mockResolvedValue([1, 300]),
    isOpen: true,
    ping: vi.fn().mockResolvedValue('PONG'),
    quit: vi.fn().mockResolvedValue(undefined),
  });
}

describe('RedisService', () => {
  it('handles connection errors instead of terminating the process', () => {
    const redis = client();
    const service = new RedisService(redis as unknown as RedisClient);

    expect(() => redis.emit('error', new Error('connection lost'))).not.toThrow();
    expect(redis.listenerCount('error')).toBe(1);
    void service;
  });

  it('removes its error listener after a graceful shutdown', async () => {
    const redis = client();
    const service = new RedisService(redis as unknown as RedisClient);

    await service.onModuleDestroy();

    expect(redis.quit).toHaveBeenCalledOnce();
    expect(redis.listenerCount('error')).toBe(0);
  });
});
