import { beforeEach, describe, expect, it, vi } from 'vitest';

import { listAuditLogs } from './audit-api';

describe('audit API client', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('requests scoped read-only filters with authorization', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ items: [], page: 1, pageSize: 50, total: 0 }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      }),
    );

    await listAuditLogs('token-1', {
      action: 'APPOINTMENT_CREATED',
      objectType: 'APPOINTMENT',
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      '/api/operation-logs?page=1&pageSize=50&action=APPOINTMENT_CREATED&objectType=APPOINTMENT',
    );
    expect((fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>).Authorization).toBe(
      'Bearer token-1',
    );
  });

  it('passes the requested page to the API', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ items: [], page: 3, pageSize: 20, total: 45 }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      }),
    );

    await listAuditLogs('token-1', { page: 3, pageSize: 20 });

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/operation-logs?page=3&pageSize=20');
  });
});
