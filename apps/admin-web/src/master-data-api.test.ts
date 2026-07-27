import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  deleteManagementItem,
  listManagementItems,
  searchHosts,
  updateManagementItem,
} from './master-data-api';

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

  it('filters the account list by profile or backoffice role', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ items: [], page: 1, pageSize: 50, total: 0 }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await listManagementItems('accounts', 'access-token', 1, undefined, {
      roleCode: 'OPERATOR',
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      '/api/backoffice/accounts?page=1&pageSize=50&roleCode=OPERATOR',
    );
  });

  it('combines personnel and qualification filters for hosts', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ items: [], page: 1, pageSize: 50, total: 0 }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await listManagementItems('hosts', 'access-token', 1, undefined, {
      personnelStatus: 'ACTIVE',
      qualificationStatus: 'CANCELLED',
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      '/api/master-data/hosts?page=1&pageSize=50&personnelStatus=ACTIVE&qualificationStatus=CANCELLED',
    );
  });

  it('sends a row-version protected business deletion', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    await deleteManagementItem('artists', 'access-token', 'artist-1', 3, '人员离职');

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/master-data/artists/artist-1/delete');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      expectedRowVersion: 3,
      reason: '人员离职',
    });
  });

  it('sends row-version protected updates to the selected resource', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    await updateManagementItem('hosts', 'access-token', 'host-1', {
      expectedRowVersion: 3,
      reason: '更正场地',
    });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/master-data/hosts/host-1');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body as string)).toEqual({
      expectedRowVersion: 3,
      reason: '更正场地',
    });
  });

  it('narrows backoffice host search to the current schedule site', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ items: [], page: 1, pageSize: 20, total: 0 }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await searchHosts('access-token', 'ZB01001', 'site-songjiang');

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      '/api/master-data/hosts?page=1&pageSize=20&personnelStatus=ACTIVE&search=ZB01001&siteId=site-songjiang',
    );
  });
});
