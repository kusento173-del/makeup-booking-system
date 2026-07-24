import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiRequest } from './api-client';
import {
  cancelUnavailablePeriod,
  createUnavailablePeriod,
  listOwnUnavailablePeriods,
  previewUnavailablePeriod,
} from './unavailability-api';

vi.mock('./api-client', () => ({ apiRequest: vi.fn() }));
const request = vi.mocked(apiRequest);
const input = { endMinute: 900, startMinute: 840, unavailableDate: '2026-07-25' };

describe('artist unavailability api', () => {
  beforeEach(() => {
    request.mockReset();
  });

  it('lists and previews the current artist periods', async () => {
    request.mockResolvedValueOnce([]).mockResolvedValueOnce({ affectedAppointmentCount: 1 });
    await listOwnUnavailablePeriods('token-1');
    await previewUnavailablePeriod('token-1', input);
    expect(request).toHaveBeenNthCalledWith(1, '/artist-unavailable-periods', {
      token: 'token-1',
    });
    expect(request).toHaveBeenNthCalledWith(2, '/artist-unavailable-periods/preview', {
      body: input,
      method: 'POST',
      token: 'token-1',
    });
  });

  it('creates and cancels a period with optimistic concurrency', async () => {
    request.mockResolvedValueOnce({ id: 'period-1' }).mockResolvedValueOnce(undefined);
    await createUnavailablePeriod('token-1', {
      ...input,
      confirmedAffectedAppointmentCount: 1,
      reason: '上课',
    });
    await cancelUnavailablePeriod('token-1', 'period-1', 2);
    expect(request).toHaveBeenNthCalledWith(1, '/artist-unavailable-periods', {
      body: { ...input, confirmedAffectedAppointmentCount: 1, reason: '上课' },
      method: 'POST',
      token: 'token-1',
    });
    expect(request).toHaveBeenNthCalledWith(2, '/artist-unavailable-periods/period-1/cancel', {
      body: { expectedRowVersion: 2 },
      method: 'POST',
      token: 'token-1',
    });
  });
});
