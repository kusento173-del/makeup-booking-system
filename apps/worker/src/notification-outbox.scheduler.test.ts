import { describe, expect, it, vi } from 'vitest';

import { NotificationOutboxScheduler } from './notification-outbox.scheduler';

const options = {
  apiUrl: 'http://127.0.0.1:3000',
  deliveryIntervalMs: 1_000,
  intervalMs: 2_000,
  token: 'x'.repeat(32),
};

describe('NotificationOutboxScheduler', () => {
  it('calls the protected endpoint and logs counts without notification content', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ deferredEventCount: 1, processedEventCount: 4, taskCount: 8 }),
          { headers: { 'Content-Type': 'application/json' }, status: 200 },
        ),
      );
    const logger = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };
    const scheduler = new NotificationOutboxScheduler(options, logger, fetcher);

    expect(await scheduler.runOnce()).toBe(true);
    expect(fetcher).toHaveBeenCalledWith(
      'http://127.0.0.1:3000/internal/jobs/notification-outbox',
      expect.objectContaining({ headers: { 'x-worker-token': options.token }, method: 'POST' }),
    );
    expect(logger.log).toHaveBeenCalledWith('通知事件已处理 4 条，生成 8 项，延后 1 条');
  });

  it('contains API failures without logging the worker token', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 500 }));
    const logger = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };
    const scheduler = new NotificationOutboxScheduler(options, logger, fetcher);

    expect(await scheduler.runOnce()).toBe(false);
    expect(logger.error).toHaveBeenCalledWith('通知事件调度失败：API responded with 500');
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain(options.token);
  });

  it('calls the protected delivery endpoint and logs only aggregate counts', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          failedCount: 1,
          processedCount: 4,
          retryCount: 1,
          succeededCount: 2,
        }),
        { headers: { 'Content-Type': 'application/json' }, status: 200 },
      ),
    );
    const logger = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };
    const scheduler = new NotificationOutboxScheduler(options, logger, fetcher);

    expect(await scheduler.runDeliveryOnce()).toBe(true);
    expect(fetcher).toHaveBeenCalledWith(
      'http://127.0.0.1:3000/internal/jobs/notification-delivery',
      expect.objectContaining({ headers: { 'x-worker-token': options.token }, method: 'POST' }),
    );
    expect(logger.log).toHaveBeenCalledWith('通知已投递 4 项：成功 2，待重试 1，失败 1');
  });
});
