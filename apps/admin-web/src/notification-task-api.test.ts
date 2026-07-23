import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  listNotificationTasks,
  type NotificationTask,
  retryNotificationTask,
} from './notification-task-api';

describe('notification task API client', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends only supported list filters', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ items: [], page: 2, pageSize: 50, total: 0 }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await listNotificationTasks('access-token', {
      date: '2026-07-23',
      page: 2,
      recipientRoleCode: 'ARTIST',
      search: '柔柔',
      status: 'FAILED',
    });

    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    expect(url).toBe(
      '/api/notification-tasks?date=2026-07-23&page=2&pageSize=50&recipientRoleCode=ARTIST&search=%E6%9F%94%E6%9F%94&status=FAILED',
    );
  });

  it('retries with the displayed row version and an operator reason', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'retry-1' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const task = { id: 'task-1', rowVersion: 4 } as NotificationTask;

    await retryNotificationTask('access-token', task, '微信服务恢复');

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/notification-tasks/task-1/retry');
    expect(JSON.parse(init.body as string)).toEqual({
      expectedRowVersion: 4,
      reason: '微信服务恢复',
    });
  });
});
