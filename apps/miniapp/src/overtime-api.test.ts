import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./api-client', () => ({ apiRequest: vi.fn() }));

import { apiRequest } from './api-client';
import { listOwnOvertimes, submitOvertime, withdrawOvertime } from './overtime-api';

const request = vi.mocked(apiRequest);

describe('overtime api', () => {
  beforeEach(() => request.mockReset());

  it('读取本人加班申请', async () => {
    request.mockResolvedValue({ items: [], total: 0 });
    await listOwnOvertimes('token-1');
    expect(request).toHaveBeenCalledWith('/overtimes?page=1&pageSize=50', {
      token: 'token-1',
    });
  });

  it('提交并撤回加班申请', async () => {
    const input = {
      breakEndMinute: null,
      breakStartMinute: null,
      overtimeDate: '2026-07-25',
      reason: '临时加班',
      workEndMinute: 1080,
      workStartMinute: 540,
    };
    request.mockResolvedValueOnce({ id: 'overtime-1' }).mockResolvedValueOnce(undefined);
    await submitOvertime('token-1', 'artist-1', input);
    expect(request).toHaveBeenNthCalledWith(1, '/artists/artist-1/overtimes', {
      body: input,
      method: 'POST',
      token: 'token-1',
    });
    await withdrawOvertime('token-1', 'overtime-1', 1);
    expect(request).toHaveBeenNthCalledWith(2, '/overtimes/overtime-1/withdraw', {
      body: { expectedRowVersion: 1 },
      method: 'POST',
      token: 'token-1',
    });
  });
});
