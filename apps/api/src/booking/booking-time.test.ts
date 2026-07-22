import { describe, expect, it } from 'vitest';

import { businessDateMinuteToInstant } from '../shift/business-date';
import {
  BookingDateInvalidError,
  BookingDurationInvalidError,
  BookingStartInvalidError,
} from './booking-time.errors';
import { listFreeStartMinutes, validateBookingDate, validateBookingStart } from './booking-time';

const now = new Date('2026-07-22T04:00:00.000Z');
const date = new Date('2026-07-23T00:00:00.000Z');

describe('booking time rules', () => {
  it('accepts only D+1 through D+7 date-only values', () => {
    expect(() => validateBookingDate(date, now)).not.toThrow();
    expect(() => validateBookingDate(new Date('2026-07-29T00:00:00.000Z'), now)).not.toThrow();
    expect(() => validateBookingDate(new Date('2026-07-22T00:00:00.000Z'), now)).toThrow(
      BookingDateInvalidError,
    );
    expect(() => validateBookingDate(new Date('2026-07-30T00:00:00.000Z'), now)).toThrow(
      BookingDateInvalidError,
    );
  });

  it('converts Shanghai business minutes to the correct instant', () => {
    expect(businessDateMinuteToInstant(date, 0).toISOString()).toBe('2026-07-22T16:00:00.000Z');
    expect(businessDateMinuteToInstant(date, 9 * 60 + 30).toISOString()).toBe(
      '2026-07-23T01:30:00.000Z',
    );
  });

  it('returns 15-minute starts that fit fully and do not overlap blocked ranges', () => {
    expect(
      listFreeStartMinutes(date, [{ endMinute: 660, startMinute: 540 }], 30, [
        {
          endAt: new Date('2026-07-23T01:30:00.000Z'),
          startAt: new Date('2026-07-23T01:00:00.000Z'),
        },
      ]),
    ).toEqual([570, 585, 600, 615, 630]);
  });

  it('keeps adjacent appointments available and rejects unsupported durations', () => {
    expect(
      listFreeStartMinutes(date, [{ endMinute: 600, startMinute: 570 }], 30, [
        {
          endAt: new Date('2026-07-23T01:00:00.000Z'),
          startAt: new Date('2026-07-23T00:30:00.000Z'),
        },
      ]),
    ).toEqual([570]);
    expect(() => listFreeStartMinutes(date, [], 20, [])).toThrow(BookingDurationInvalidError);
  });

  it('accepts only safe 15-minute starts that end within the date', () => {
    expect(() => validateBookingStart(570, 30)).not.toThrow();
    expect(() => validateBookingStart(1430, 15)).toThrow(BookingStartInvalidError);
    expect(() => validateBookingStart(571, 30)).toThrow(BookingStartInvalidError);
    expect(() => validateBookingStart(Number.NaN, 30)).toThrow(BookingStartInvalidError);
  });
});
