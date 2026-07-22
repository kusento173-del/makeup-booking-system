import { afterEach, describe, expect, it, vi } from 'vitest';

import { listManagementItems } from './master-data-api';

describe('master-data API client', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('encodes bounded pagination and search in one request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ items: [], page: 2, pageSize: 50, total: 0 }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await listManagementItems('hosts', 'access-token', 2, '小雨 ZB01');

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/master-data/hosts?page=2&pageSize=50&search=%E5%B0%8F%E9%9B%A8+ZB01');
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer access-token');
  });
});
