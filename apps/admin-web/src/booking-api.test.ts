import { afterEach, describe, expect, it, vi } from 'vitest';

import { cancelBooking, getBookingSlots, rescheduleBooking } from './booking-api';

describe('booking API client', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('queries reschedule slots while excluding the original appointment', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ slots: [] }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await getBookingSlots('token', {
      artistId: 'artist-1',
      date: '2026-07-23',
      durationMinutes: 45,
      excludeAppointmentId: 'appointment-1',
      hostId: 'host-1',
    });

    expect(fetchMock.mock.calls[0]?.[0]).toContain('excludeAppointmentId=appointment-1');
  });

  it('sends row version and reason when cancelling', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'appointment-1', status: 'CANCELLED' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await cancelBooking('token', 'appointment-1', { expectedRowVersion: 3, reason: '主播请假' });

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ expectedRowVersion: 3, reason: '主播请假' });
  });

  it('sends an idempotency key when rescheduling', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ appointment: { id: 'appointment-2' }, replayed: false }), {
        headers: { 'Content-Type': 'application/json' },
        status: 201,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await rescheduleBooking(
      'token',
      'appointment-1',
      {
        artistId: 'artist-2',
        confirmedSecondBooking: false,
        date: '2026-07-24',
        durationMinutes: 30,
        expectedRowVersion: 2,
        reason: '主播调整开播时间',
        startMinute: 600,
      },
      'reschedule-key-1',
    );

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>)['Idempotency-Key']).toBe('reschedule-key-1');
  });
});
