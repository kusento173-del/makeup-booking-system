import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./api-client', () => ({ apiRequest: vi.fn() }));

import { apiRequest } from './api-client';
import { cancelAppointment } from './appointment-api';

const request = vi.mocked(apiRequest);

describe('appointment api', () => {
  beforeEach(() => {
    request.mockReset();
  });

  it('使用预约行版本提交取消请求', async () => {
    request.mockResolvedValue({
      cancelledAt: '2026-07-23T12:00:00.000Z',
      id: 'appointment-1',
      rowVersion: 2,
      status: 'CANCELLED',
    });
    await cancelAppointment('token-1', 'appointment-1', 1);
    expect(request).toHaveBeenCalledWith('/appointments/appointment-1/cancel', {
      body: { expectedRowVersion: 1 },
      method: 'POST',
      token: 'token-1',
    });
  });
});
