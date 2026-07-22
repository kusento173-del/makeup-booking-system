import { describe, expect, it, vi } from 'vitest';

import { ExportScheduler } from './export.scheduler';

const options = {
  apiUrl: 'http://127.0.0.1:3000',
  cleanupIntervalMs: 60_000,
  intervalMs: 5_000,
  token: 'x'.repeat(32),
};

describe('ExportScheduler', () => {
  it('calls the protected export endpoint and reports processed jobs', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ exportJobId: 'job-1', processed: true, status: 'SUCCEEDED' }),
          { headers: { 'Content-Type': 'application/json' }, status: 200 },
        ),
      );
    const logger = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };
    const scheduler = new ExportScheduler(options, logger, fetcher);

    expect(await scheduler.runOnce()).toBe(true);
    expect(fetcher).toHaveBeenCalledWith(
      'http://127.0.0.1:3000/internal/jobs/schedule-export',
      expect.objectContaining({ headers: { 'x-worker-token': options.token }, method: 'POST' }),
    );
    expect(logger.log).toHaveBeenCalledWith('排班导出 job-1 处理完成：SUCCEEDED');
  });

  it('contains API failures without leaking the worker token', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 500 }));
    const logger = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };
    const scheduler = new ExportScheduler(options, logger, fetcher);

    expect(await scheduler.runOnce()).toBe(false);
    expect(logger.error).toHaveBeenCalledWith('排班导出调度失败：API responded with 500');
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain(options.token);
  });

  it('calls the protected cleanup endpoint', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ cleaned: true, exportJobId: 'job-1' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      }),
    );
    const logger = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };
    const scheduler = new ExportScheduler(options, logger, fetcher);

    expect(await scheduler.runCleanupOnce()).toBe(true);
    expect(fetcher).toHaveBeenCalledWith(
      'http://127.0.0.1:3000/internal/jobs/schedule-export-cleanup',
      expect.objectContaining({ headers: { 'x-worker-token': options.token }, method: 'POST' }),
    );
    expect(logger.log).toHaveBeenCalledWith('排班导出 job-1 过期文件已清理');
  });
});
