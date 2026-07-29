import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./api-client', () => ({ apiRequest: vi.fn() }));

import { apiRequest } from './api-client';
import { directlySetFixedRule, getFixedRuleAvailability, listFixedRules } from './fixed-rule-api';

const request = vi.mocked(apiRequest);

describe('fixed rule api', () => {
  beforeEach(() => request.mockReset());

  it('serializes fixed-host list filters', async () => {
    request.mockResolvedValue({ items: [], page: 2, pageSize: 50, total: 0 });

    await listFixedRules('token-1', {
      page: 2,
      search: '阿伟',
      siteId: 'site-1',
      status: 'ACTIVE',
    });

    expect(request).toHaveBeenCalledWith(
      '/fixed-appointments/rules?page=2&pageSize=50&search=%E9%98%BF%E4%BC%9F&siteId=site-1&status=ACTIVE',
      { token: 'token-1' },
    );
  });

  it('loads available fixed time slots with the current rule excluded', async () => {
    request.mockResolvedValue({ slots: [], unavailableReason: null });

    await getFixedRuleAvailability('token-1', {
      artistId: 'artist-1',
      currentRuleId: 'rule-1',
      durationMinutes: 30,
      hostId: 'host-1',
      requestedStartDate: '2026-07-30',
      weekdays: [1, 3, 5],
    });

    expect(request).toHaveBeenCalledWith(
      '/fixed-appointments/availability?artistId=artist-1&durationMinutes=30&hostId=host-1&requestedStartDate=2026-07-30&weekdays=1%2C3%2C5&currentRuleId=rule-1',
      { token: 'token-1' },
    );
  });

  it('submits a backoffice fixed relationship command', async () => {
    request.mockResolvedValue(undefined);

    await directlySetFixedRule('token-1', {
      artistId: 'artist-1',
      durationMinutes: 30,
      effectiveFrom: '2026-07-30',
      hostId: 'host-1',
      reason: '线下已确认',
      requestType: 'CREATE',
      startMinute: 600,
      weekdays: [1, 3, 5],
    });

    expect(request).toHaveBeenCalledWith('/fixed-appointments/rules/direct', {
      body: {
        artistId: 'artist-1',
        durationMinutes: 30,
        effectiveFrom: '2026-07-30',
        hostId: 'host-1',
        reason: '线下已确认',
        requestType: 'CREATE',
        startMinute: 600,
        weekdays: [1, 3, 5],
      },
      method: 'POST',
      token: 'token-1',
    });
  });
});
