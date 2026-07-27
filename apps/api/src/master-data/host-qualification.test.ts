import { describe, expect, it } from 'vitest';

import { effectiveHostQualification, isHostQualifiedOn } from './host-qualification';

describe('host qualification', () => {
  const cancellation = {
    qualificationStatus: 'CANCELLED',
    qualificationValidUntil: new Date('2026-08-10T00:00:00.000Z'),
  };

  it('keeps the host ineligible through the selected end date', () => {
    expect(isHostQualifiedOn(cancellation, new Date('2026-08-10T09:00:00+08:00'))).toBe(false);
    expect(effectiveHostQualification(cancellation, new Date('2026-08-10T09:00:00+08:00'))).toBe(
      'CANCELLED',
    );
  });

  it('automatically restores eligibility on the following day', () => {
    expect(isHostQualifiedOn(cancellation, new Date('2026-08-11T00:00:00+08:00'))).toBe(true);
    expect(effectiveHostQualification(cancellation, new Date('2026-08-11T00:00:00+08:00'))).toBe(
      'ACTIVE',
    );
  });
});
