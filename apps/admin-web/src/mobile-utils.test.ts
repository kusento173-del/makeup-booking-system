import { describe, expect, it, vi } from 'vitest';

import {
  bookingDates,
  businessDate,
  isoTimeLabel,
  minuteLabel,
  timeToMinute,
} from './mobile-utils';

describe('mobile date and time helpers', () => {
  it('offers exactly the next seven business dates', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-27T14:00:00+08:00'));

    expect(bookingDates()).toEqual([
      { date: '2026-07-28', label: '明天' },
      { date: '2026-07-29', label: '周三' },
      { date: '2026-07-30', label: '周四' },
      { date: '2026-07-31', label: '周五' },
      { date: '2026-08-01', label: '周六' },
      { date: '2026-08-02', label: '周日' },
      { date: '2026-08-03', label: '周一' },
    ]);

    vi.useRealTimers();
  });

  it('uses the Shanghai business date around UTC day boundaries', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-27T16:30:00.000Z'));

    expect(businessDate()).toBe('2026-07-28');
    expect(businessDate(1)).toBe('2026-07-29');

    vi.useRealTimers();
  });

  it('converts minute and ISO values to compact labels', () => {
    expect(minuteLabel(0)).toBe('00:00');
    expect(minuteLabel(1_035)).toBe('17:15');
    expect(timeToMinute('17:15')).toBe(1_035);
    expect(isoTimeLabel('2026-07-27T01:30:00.000Z')).toBe('09:30');
  });
});
