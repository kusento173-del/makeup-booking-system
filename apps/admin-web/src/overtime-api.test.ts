import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./api-client', () => ({ apiRequest: vi.fn() }));

import { apiRequest } from './api-client';
import { listPendingOvertimes, reviewOvertime } from './overtime-api';

const request = vi.mocked(apiRequest);

describe('overtime api', () => {
  beforeEach(() => request.mockReset());

  it('读取待审核加班申请', async () => {
    request.mockResolvedValue({ items: [], total: 0 });
    await listPendingOvertimes('token-1');
    expect(request).toHaveBeenCalledWith('/overtimes?page=1&pageSize=100&status=PENDING', {
      token: 'token-1',
    });
  });

  it('提交加班审核决定', async () => {
    request.mockResolvedValue(undefined);
    await reviewOvertime('token-1', { id: 'overtime-1', rowVersion: 2 }, 'REJECT', '时间不符');
    expect(request).toHaveBeenCalledWith('/overtimes/overtime-1/review', {
      body: { comment: '时间不符', decision: 'REJECT', expectedRowVersion: 2 },
      method: 'POST',
      token: 'token-1',
    });
  });
});
