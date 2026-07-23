import { describe, expect, it, vi } from 'vitest';

import { BookingMaintenanceScheduler } from './booking-maintenance.scheduler';

const options = {
  apiUrl: 'http://127.0.0.1:3000',
  intervalMs: 60_000,
  token: 'a'.repeat(32),
};

function logger() {
  return { error: vi.fn(), log: vi.fn(), warn: vi.fn() };
}

describe('BookingMaintenanceScheduler', () => {
  it('calls the private generation endpoint without exposing its token in logs', async () => {
    const logs = logger();
    const fetcher = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue({ generated: 3 }),
      ok: true,
      status: 200,
    });
    const scheduler = new BookingMaintenanceScheduler(options, logs, fetcher as typeof fetch);

    await expect(scheduler.runGenerationOnce()).resolves.toBe(true);

    expect(fetcher.mock.calls[0]?.[0]).toBe('http://127.0.0.1:3000/internal/jobs/fixed-generation');
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
      headers: { 'x-worker-token': options.token },
      method: 'POST',
    });
    expect(logs.log).toHaveBeenCalledWith('固定预约生成完成，新增 3 条');
    expect(JSON.stringify(logs.log.mock.calls)).not.toContain(options.token);
  });

  it('skips overlapping runs and allows the next retry after a failure', async () => {
    let resolveRequest!: (value: object) => void;
    const fetcher = vi
      .fn()
      .mockImplementationOnce(
        () => new Promise((resolve) => (resolveRequest = resolve as (value: object) => void)),
      )
      .mockRejectedValueOnce(new Error('network down'));
    const logs = logger();
    const scheduler = new BookingMaintenanceScheduler(options, logs, fetcher as typeof fetch);

    const first = scheduler.runGenerationOnce();
    await expect(scheduler.runGenerationOnce()).resolves.toBe(false);
    resolveRequest({ json: vi.fn().mockResolvedValue({ generated: 0 }), ok: true, status: 200 });
    await expect(first).resolves.toBe(true);
    await expect(scheduler.runGenerationOnce()).resolves.toBe(false);

    expect(logs.warn).toHaveBeenCalledOnce();
    expect(logs.error).toHaveBeenCalledWith('固定预约生成失败：network down');
  });

  it('completes due appointments without logging appointment content', async () => {
    const logs = logger();
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ completed: 6 }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      }),
    );
    const scheduler = new BookingMaintenanceScheduler(options, logs, fetcher);

    await expect(scheduler.runCompletionOnce()).resolves.toBe(true);
    expect(fetcher).toHaveBeenCalledWith(
      'http://127.0.0.1:3000/internal/jobs/appointment-completion',
      expect.objectContaining({ headers: { 'x-worker-token': options.token }, method: 'POST' }),
    );
    expect(logs.log).toHaveBeenCalledWith('预约自动完成 6 条');
  });

  it('rejects unsafe configuration', () => {
    expect(
      () => new BookingMaintenanceScheduler({ ...options, intervalMs: 1000 }, logger()),
    ).toThrow('BOOKING_MAINTENANCE_INTERVAL_MS');
    expect(() => new BookingMaintenanceScheduler({ ...options, token: 'short' }, logger())).toThrow(
      'INTERNAL_WORKER_TOKEN',
    );
  });
});
