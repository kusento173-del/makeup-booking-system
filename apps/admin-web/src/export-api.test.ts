import { afterEach, describe, expect, it, vi } from 'vitest';

import { createExportJob, listExportJobs } from './export-api';

describe('export API client', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('lists the latest export jobs with authorization', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ items: [], page: 1, pageSize: 50, total: 0 }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await listExportJobs('access-token');

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/export-jobs?page=1&pageSize=50');
  });

  it('creates an idempotent all-sites export', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'job-1', status: 'PENDING' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 201,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await createExportJob(
      'access-token',
      { scheduleDate: '2026-07-23', scope: 'ALL_SITES' },
      'export-key-0001',
    );

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>)['Idempotency-Key']).toBe('export-key-0001');
    expect(JSON.parse(init.body as string)).toEqual({
      scheduleDate: '2026-07-23',
      scope: 'ALL_SITES',
    });
  });
});
