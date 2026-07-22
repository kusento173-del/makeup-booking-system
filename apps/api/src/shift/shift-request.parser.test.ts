import { describe, expect, it } from 'vitest';

import {
  assertNoShiftQuery,
  parseDirectShiftChangeRequest,
  parseInitialShiftRequest,
  parseReviewShiftChangeRequest,
  parseShiftChangeListRequest,
  parseSubmitShiftChangeRequest,
  parseWithdrawShiftChangeRequest,
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

  it('parses change dates, reasons and row-version state commands', () => {
    expect(
      parseSubmitShiftChangeRequest(artistId, {
        effectiveFrom: '2026-07-24',
        reason: ' 调整工作日 ',
        workEndMinute: 1080,
        workStartMinute: 540,
        workdays: [1, 2, 3],
      }),
    ).toMatchObject({
      effectiveFrom: new Date('2026-07-24T00:00:00.000Z'),
      reason: '调整工作日',
    });
    expect(parseWithdrawShiftChangeRequest(artistId, { expectedRowVersion: 2 })).toEqual({
      expectedRowVersion: 2,
      requestId: artistId,
    });
    expect(
      parseDirectShiftChangeRequest(artistId, {
        effectiveFrom: '2026-07-24',
        expectedVersionNo: 3,
        reason: ' 客服代改 ',
        workEndMinute: 1080,
        workStartMinute: 540,
        workdays: [1, 2, 3],
      }),
    ).toMatchObject({
      expectedVersionNo: 3,
      reason: '客服代改',
    });
    expect(
      parseReviewShiftChangeRequest(artistId, {
        comment: ' 同意 ',
        decision: 'APPROVE',
        expectedRowVersion: 2,
      }),
    ).toEqual({
      comment: '同意',
      decision: 'APPROVE',
      expectedRowVersion: 2,
      requestId: artistId,
    });
  });

  it('bounds list pagination and rejects invalid dates or decisions', () => {
    expect(parseShiftChangeListRequest({ page: '2', pageSize: '20', status: 'PENDING' })).toEqual({
      page: 2,
      pageSize: 20,
      status: 'PENDING',
    });
    expect(() => parseShiftChangeListRequest({ pageSize: '101' })).toThrow(
      ShiftRequestInvalidError,
    );
    expect(() =>
      parseSubmitShiftChangeRequest(artistId, {
        effectiveFrom: '2026-02-30',
        reason: '调整',
        workEndMinute: 1080,
        workStartMinute: 540,
        workdays: [1],
      }),
    ).toThrow(ShiftRequestInvalidError);
    expect(() =>
      parseReviewShiftChangeRequest(artistId, {
        decision: 'YES',
        expectedRowVersion: 1,
      }),
    ).toThrow(ShiftRequestInvalidError);
  });
});
