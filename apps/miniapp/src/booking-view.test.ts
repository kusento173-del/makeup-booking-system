import { describe, expect, it } from 'vitest';

import type { BookingSlot } from './booking-api';
import {
  bookingSignature,
  createIdempotencyKey,
  futureBookingDates,
  slotTime,
} from './booking-view';

const slot: BookingSlot = {
  endAt: '2026-07-24T02:00:00.000Z',
  startAt: '2026-07-24T01:30:00.000Z',
  startMinute: 570,
};

describe('booking view', () => {
  it('生成上海业务日期的明日起未来七日', () => {
    const dates = futureBookingDates(new Date('2026-07-23T16:30:00.000Z'));
    expect(dates).toHaveLength(7);
    expect(dates[0]?.date).toBe('2026-07-25');
    expect(dates[6]?.date).toBe('2026-07-31');
  });

  it('格式化档期并生成稳定的请求签名', () => {
    expect(slotTime(slot)).toBe('09:30–10:00');
    expect(
      bookingSignature({
        artistId: 'artist-1',
        date: '2026-07-24',
        durationMinutes: 30,
        startMinute: 570,
      }),
    ).toBe('artist-1:2026-07-24:30:570');
  });

  it('生成符合服务端规则的幂等键', () => {
    expect(createIdempotencyKey(123, 0.5)).toMatch(/^miniapp-booking-123-[a-z0-9]{8,}$/);
  });
});
