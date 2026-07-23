import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./api-client', () => ({ apiRequest: vi.fn() }));

import { apiRequest } from './api-client';
import { listAvailableArtists, listManagedHosts } from './booking-api';

const request = vi.mocked(apiRequest);

describe('booking api', () => {
  beforeEach(() => {
    request.mockReset();
  });

  it('按目标日期和检索词查询运营负责主播', async () => {
    request.mockResolvedValue({ items: [], page: 1, pageSize: 50, total: 0 });
    await listManagedHosts('token-1', {
      date: '2026-07-24',
      page: 1,
      search: 'ZB01',
    });
    expect(request).toHaveBeenCalledWith(
      '/master-data/hosts?asOf=2026-07-24&page=1&pageSize=50&search=ZB01',
      { token: 'token-1' },
    );
  });

  it('分页读取当前角色同场地的全部化妆师', async () => {
    request
      .mockResolvedValueOnce({
        items: [{ id: 'artist-1' }],
        page: 1,
        pageSize: 100,
        total: 2,
      })
      .mockResolvedValueOnce({
        items: [{ id: 'artist-2' }],
        page: 2,
        pageSize: 100,
        total: 2,
      });
    await expect(listAvailableArtists('token-1')).resolves.toHaveLength(2);
    expect(request).toHaveBeenLastCalledWith('/master-data/artists?page=2&pageSize=100', {
      token: 'token-1',
    });
  });
});
