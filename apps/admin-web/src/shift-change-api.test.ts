import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./api-client', () => ({ apiRequest: vi.fn() }));

import { apiRequest } from './api-client';
import { listPendingShiftChanges, reviewShiftChange } from './shift-change-api';

const request = vi.mocked(apiRequest);

describe('shift change api', () => {
  beforeEach(() => request.mockReset());

  it('读取待审核申请', async () => {
    request.mockResolvedValue({ items: [], total: 0 });
    await listPendingShiftChanges('token-1');
    expect(request).toHaveBeenCalledWith('/shift-changes?page=1&pageSize=100&status=PENDING', {
      token: 'token-1',
    });
  });

  it('提交审核决定和可选意见', async () => {
    request.mockResolvedValue(undefined);
    await reviewShiftChange('token-1', { id: 'change-1', rowVersion: 2 }, 'REJECT', ' 时间不合适 ');
    expect(request).toHaveBeenCalledWith('/shift-changes/change-1/review', {
      body: {
        comment: '时间不合适',
        decision: 'REJECT',
        expectedRowVersion: 2,
      },
      method: 'POST',
      token: 'token-1',
    });
  });
});
