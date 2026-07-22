import { afterEach, describe, expect, it, vi } from 'vitest';

import { getScheduleBoard } from './schedule-board-api';

describe('schedule-board API client', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('requests the selected date and optional administrator site', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          artists: [],
          date: '2026-07-23',
          lastUpdatedAt: '2026-07-22T12:00:00.000Z',
          siteId: 'site-1',
          siteName: '松江场地',
        }),
        { headers: { 'Content-Type': 'application/json' }, status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await getScheduleBoard('access-token', '2026-07-23', 'site-1');

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/schedule-board?date=2026-07-23&siteId=site-1');
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer access-token');
  });

  it('lets customer service use the site carried by its role', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          artists: [],
          date: '2026-07-22',
          lastUpdatedAt: '2026-07-22T12:00:00.000Z',
          siteId: 'site-1',
          siteName: '松江场地',
        }),
        { headers: { 'Content-Type': 'application/json' }, status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await getScheduleBoard('access-token', '2026-07-22');

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/schedule-board?date=2026-07-22');
  });
});
