import { describe, expect, it } from 'vitest';

import { toBusinessDate } from './business-date';

describe('toBusinessDate', () => {
  it('uses the next Shanghai date before UTC midnight', () => {
    expect(toBusinessDate(new Date('2026-07-22T16:30:00.000Z')).toISOString()).toBe(
      '2026-07-23T00:00:00.000Z',
    );
  });

  it('keeps the calendar date during the Shanghai morning', () => {
    expect(toBusinessDate(new Date('2026-07-22T00:30:00.000Z')).toISOString()).toBe(
      '2026-07-22T00:00:00.000Z',
    );
  });
});
