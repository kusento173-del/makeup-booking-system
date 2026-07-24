import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./api-client', () => ({ apiRequest: vi.fn() }));

import { apiRequest } from './api-client';
import { listPendingFixedRequests, reviewFixedRequest } from './fixed-request-api';

const request = vi.mocked(apiRequest);

describe('fixed request api', () => {
  beforeEach(() => request.mockReset());

  it('读取当前权限范围内的待审核固定申请', async () => {
    request.mockResolvedValue({ items: [], total: 0 });
    await listPendingFixedRequests('token-1');
    expect(request).toHaveBeenCalledWith(
      '/fixed-appointments/requests?page=1&pageSize=100&status=PENDING',
      { token: 'token-1' },
    );
  });

  it('提交审核决定、行版本和驳回原因', async () => {
    request.mockResolvedValue(undefined);
    await reviewFixedRequest(
      'token-1',
      { id: 'request-1', rowVersion: 2 },
      'REJECT',
      ' 时间不合适 ',
    );
    expect(request).toHaveBeenCalledWith('/fixed-appointments/requests/request-1/review', {
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
