import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiRequest } from './api-client';
import {
  cancelAppointment,
  createAppointment,
  createFixedRequest,
  getBookingSlots,
  getFixedAvailability,
  listAppointments,
  listManagedHosts,
} from './mobile-api';

vi.mock('./api-client', () => ({ apiRequest: vi.fn() }));
const request = vi.mocked(apiRequest);

describe('mobile web API client', () => {
  beforeEach(() => request.mockReset());

  it('queries the signed-in role schedule and booking slots', async () => {
    request.mockResolvedValue({});
    await listAppointments('token-1', '2026-07-28', '2026-08-03');
    await getBookingSlots('token-1', {
      artistId: 'artist-1',
      date: '2026-07-28',
      durationMinutes: 45,
      excludeAppointmentId: 'appointment-1',
      hostId: 'host-1',
    });

    expect(request).toHaveBeenNthCalledWith(
      1,
      '/appointments?fromDate=2026-07-28&page=1&pageSize=100&toDate=2026-08-03',
      { token: 'token-1' },
    );
    expect(request.mock.calls[1]?.[0]).toContain('excludeAppointmentId=appointment-1');
  });

  it('creates and cancels appointments with concurrency protection', async () => {
    request.mockResolvedValue({});
    await createAppointment('token-1', {
      artistId: 'artist-1',
      confirmedSecondBooking: true,
      date: '2026-07-28',
      durationMinutes: 30,
      hostId: 'host-1',
      startMinute: 570,
    });
    await cancelAppointment('token-1', 'appointment-1', 4);

    const appointmentOptions = request.mock.calls[0]?.[1];
    expect(appointmentOptions).toMatchObject({
      body: { confirmedSecondBooking: true, startMinute: 570 },
      method: 'POST',
      token: 'token-1',
    });
    expect(typeof appointmentOptions?.headers?.['Idempotency-Key']).toBe('string');
    expect(request).toHaveBeenNthCalledWith(2, '/appointments/appointment-1/cancel', {
      body: { expectedRowVersion: 4 },
      method: 'POST',
      token: 'token-1',
    });
  });

  it('queries operator scope and preserves fixed-booking constraints', async () => {
    request.mockResolvedValue({});
    await listManagedHosts('token-1', '2026-07-28');
    await getFixedAvailability('token-1', {
      artistId: 'artist-1',
      currentRuleId: 'rule-1',
      durationMinutes: 30,
      hostId: 'host-1',
      requestedStartDate: '2026-07-28',
      weekdays: [1, 3, 5],
    });
    await createFixedRequest('token-1', {
      artistId: 'artist-1',
      currentRuleId: 'rule-1',
      durationMinutes: 30,
      effectiveFrom: '2026-07-28',
      hostId: 'host-1',
      reason: '调整开播时间',
      startMinute: 600,
      weekdays: [1, 3, 5],
    });

    expect(request).toHaveBeenNthCalledWith(
      1,
      '/fixed-appointments/managed-hosts?asOf=2026-07-28&page=1&pageSize=100',
      { token: 'token-1' },
    );
    expect(request.mock.calls[1]?.[0]).toContain('currentRuleId=rule-1');
    expect(request.mock.calls[1]?.[0]).toContain('weekdays=1%2C3%2C5');
    expect(request.mock.calls[2]?.[0]).toBe('/fixed-appointments/requests/change');
    const fixedOptions = request.mock.calls[2]?.[1];
    expect(fixedOptions).toMatchObject({
      body: { currentRuleId: 'rule-1', reason: '调整开播时间' },
      method: 'POST',
      token: 'token-1',
    });
    expect(typeof fixedOptions?.headers?.['Idempotency-Key']).toBe('string');
  });
});
