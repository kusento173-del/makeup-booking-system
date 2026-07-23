import { describe, expect, it } from 'vitest';

import { bookingDateOptions, createIdempotencyKey } from './booking-view';

describe('booking view', () => {
  it('只提供明日起连续七个上海业务日期', () => {
    const options = bookingDateOptions(new Date('2026-07-23T15:30:00.000Z'));
    expect(options.map((option) => option.date)).toEqual([
      '2026-07-24',
      '2026-07-25',
      '2026-07-26',
      '2026-07-27',
      '2026-07-28',
      '2026-07-29',
      '2026-07-30',
    ]);
  });

  it('生成服务端可接受的 UUID 幂等键', () => {
    expect(createIdempotencyKey(0x123456789abc, () => 0.5)).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});
