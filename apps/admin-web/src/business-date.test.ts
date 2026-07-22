import { describe, expect, it } from 'vitest';

import { addBusinessDays, currentBusinessDate } from './business-date';

describe('admin business-date helpers', () => {
  it('uses the Shanghai business day', () => {
    expect(currentBusinessDate(new Date('2026-07-21T16:30:00.000Z'))).toBe('2026-07-22');
  });

  it('adds calendar days across month boundaries', () => {
    expect(addBusinessDays('2026-07-31', 1)).toBe('2026-08-01');
    expect(addBusinessDays('2026-08-01', -1)).toBe('2026-07-31');
  });
});
