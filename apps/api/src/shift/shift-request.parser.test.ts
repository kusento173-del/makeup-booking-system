import { describe, expect, it } from 'vitest';

import {
  assertNoShiftQuery,
  parseInitialShiftRequest,
  ShiftRequestInvalidError,
} from './shift-request.parser';

const artistId = '019f7a17-6845-7a90-94cb-e5f5caabd5f6';

describe('shift request parser', () => {
  it('accepts a strict shift with nullable break fields', () => {
    expect(
      parseInitialShiftRequest(artistId.toUpperCase(), {
        breakEndMinute: null,
        breakStartMinute: null,
        workEndMinute: 1080,
        workStartMinute: 540,
        workdays: [1, 2, 3, 4, 5],
      }),
    ).toEqual({
      artistId,
      breakEndMinute: null,
      breakStartMinute: null,
      workEndMinute: 1080,
      workStartMinute: 540,
      workdays: [1, 2, 3, 4, 5],
    });
  });

  it('rejects unknown fields and non-integer values', () => {
    expect(() =>
      parseInitialShiftRequest(artistId, {
        breakEndMinute: null,
        breakStartMinute: null,
        siteId: 'untrusted-site',
        workEndMinute: 1080,
        workStartMinute: 540,
        workdays: [1],
      }),
    ).toThrow(ShiftRequestInvalidError);
    expect(() =>
      parseInitialShiftRequest(artistId, {
        workEndMinute: 1080,
        workStartMinute: '540',
        workdays: [1],
      }),
    ).toThrow(ShiftRequestInvalidError);
  });

  it('rejects malformed artist IDs and unexpected query parameters', () => {
    expect(() =>
      parseInitialShiftRequest('artist-1', {
        workEndMinute: 1080,
        workStartMinute: 540,
        workdays: [1],
      }),
    ).toThrow(ShiftRequestInvalidError);
    expect(() => assertNoShiftQuery({ siteId: 'site-wuxi' })).toThrow(ShiftRequestInvalidError);
  });
});
