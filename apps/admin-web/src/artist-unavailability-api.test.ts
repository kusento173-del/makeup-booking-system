import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiRequest } from './api-client';
import {
  cancelArtistUnavailablePeriod,
  createArtistUnavailablePeriod,
  listArtistUnavailablePeriods,
  previewArtistUnavailablePeriod,
} from './artist-unavailability-api';

vi.mock('./api-client', () => ({ apiRequest: vi.fn() }));
const request = vi.mocked(apiRequest);
const range = {
  artistId: 'artist-1',
  endMinute: 900,
  startMinute: 840,
  unavailableDate: '2026-07-25',
};

describe('artist unavailability admin api', () => {
  beforeEach(() => request.mockReset());

  it('lists and previews a selected artist', async () => {
    request.mockResolvedValueOnce([]).mockResolvedValueOnce({ affectedAppointmentCount: 1 });
    await listArtistUnavailablePeriods('token-1', 'artist-1');
    await previewArtistUnavailablePeriod('token-1', range);
    expect(request).toHaveBeenNthCalledWith(1, '/artist-unavailable-periods?artistId=artist-1', {
      token: 'token-1',
    });
    expect(request).toHaveBeenNthCalledWith(2, '/artist-unavailable-periods/preview', {
      body: range,
      method: 'POST',
      token: 'token-1',
    });
  });

  it('creates and cancels with required staff reasons', async () => {
    request.mockResolvedValueOnce({ id: 'period-1' }).mockResolvedValueOnce(undefined);
    await createArtistUnavailablePeriod('token-1', {
      ...range,
      confirmedAffectedAppointmentCount: 1,
      reason: '上课',
    });
    await cancelArtistUnavailablePeriod('token-1', 'period-1', {
      expectedRowVersion: 1,
      reason: '课程取消',
    });
    expect(request).toHaveBeenNthCalledWith(2, '/artist-unavailable-periods/period-1/cancel', {
      body: { expectedRowVersion: 1, reason: '课程取消' },
      method: 'POST',
      token: 'token-1',
    });
  });
});
