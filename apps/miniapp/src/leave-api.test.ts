import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./api-client', () => ({ apiRequest: vi.fn() }));

import { apiRequest } from './api-client';
import { cancelLeave, createLeave, listOwnLeaves, previewLeave } from './leave-api';

const request = vi.mocked(apiRequest);

describe('leave api', () => {
  beforeEach(() => request.mockReset());

  it('读取本人有效请假', async () => {
    request.mockResolvedValue([]);
    await listOwnLeaves('token-1');
    expect(request).toHaveBeenCalledWith('/leaves', { token: 'token-1' });
  });

  it('预览并确认请假', async () => {
    const range = { endDate: '2026-07-26', startDate: '2026-07-25' };
    request.mockResolvedValueOnce({ affectedAppointmentCount: 2 }).mockResolvedValueOnce({
      id: 'leave-1',
    });
    await previewLeave('token-1', range);
    expect(request).toHaveBeenNthCalledWith(1, '/leaves/preview', {
      body: range,
      method: 'POST',
      token: 'token-1',
    });
    await createLeave('token-1', {
      ...range,
      confirmedAffectedAppointmentCount: 2,
      reason: '休息',
    });
    expect(request).toHaveBeenNthCalledWith(2, '/leaves', {
      body: { ...range, confirmedAffectedAppointmentCount: 2, reason: '休息' },
      method: 'POST',
      token: 'token-1',
    });
  });

  it('取消尚未开始的请假', async () => {
    request.mockResolvedValue(undefined);
    await cancelLeave('token-1', 'leave-1', 2);
    expect(request).toHaveBeenCalledWith('/leaves/leave-1/cancel', {
      body: { expectedRowVersion: 2 },
      method: 'POST',
      token: 'token-1',
    });
  });
});
