import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./api-client', () => ({ apiRequest: vi.fn() }));

import { apiRequest } from './api-client';
import { getCurrentShift, getOwnArtist, setInitialShift } from './shift-api';

const request = vi.mocked(apiRequest);

describe('shift api', () => {
  beforeEach(() => {
    request.mockReset();
  });

  it('读取当前登录化妆师档案', async () => {
    request.mockResolvedValue({ items: [{ id: 'artist-1' }] });
    await expect(getOwnArtist('token-1')).resolves.toEqual({ id: 'artist-1' });
    expect(request).toHaveBeenCalledWith('/master-data/artists?page=1&pageSize=1', {
      token: 'token-1',
    });
  });

  it('读取当前生效班次', async () => {
    request.mockResolvedValue({ id: 'shift-1' });
    await getCurrentShift('token-1', 'artist-1');
    expect(request).toHaveBeenCalledWith('/artists/artist-1/shifts/current', {
      token: 'token-1',
    });
  });

  it('提交首次班次设置', async () => {
    const definition = {
      breakEndMinute: 780,
      breakStartMinute: 720,
      workEndMinute: 1080,
      workStartMinute: 540,
      workdays: [1, 2, 3, 4, 5],
    };
    request.mockResolvedValue({ id: 'shift-1' });
    await setInitialShift('token-1', 'artist-1', definition);
    expect(request).toHaveBeenCalledWith('/artists/artist-1/shifts/initial', {
      body: definition,
      method: 'POST',
      token: 'token-1',
    });
  });
});
