import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiRequest } from './api-client';
import { directlyChangeShift, getCurrentShift, setInitialShift } from './artist-shift-api';

vi.mock('./api-client', () => ({ apiRequest: vi.fn() }));
const request = vi.mocked(apiRequest);
const definition = {
  breakEndMinute: 780,
  breakStartMinute: 720,
  workEndMinute: 1_080,
  workStartMinute: 540,
  workdays: [1, 2, 3, 4, 5],
};

describe('artist shift API client', () => {
  beforeEach(() => request.mockReset().mockResolvedValue({}));

  it('reads and initializes an artist shift', async () => {
    await getCurrentShift('token', 'artist-1');
    await setInitialShift('token', 'artist-1', definition);

    expect(request).toHaveBeenNthCalledWith(1, '/artists/artist-1/shifts/current', {
      token: 'token',
    });
    expect(request).toHaveBeenNthCalledWith(2, '/artists/artist-1/shifts/initial', {
      body: definition,
      method: 'POST',
      token: 'token',
    });
  });

  it('directly changes an existing shift with concurrency protection', async () => {
    await directlyChangeShift('token', 'artist-1', {
      ...definition,
      effectiveFrom: '2026-07-30',
      expectedVersionNo: 2,
      reason: '课程时间调整',
    });

    expect(request).toHaveBeenCalledWith('/artists/artist-1/shifts/direct-change', {
      body: {
        ...definition,
        effectiveFrom: '2026-07-30',
        expectedVersionNo: 2,
        reason: '课程时间调整',
      },
      method: 'POST',
      token: 'token',
    });
  });
});
