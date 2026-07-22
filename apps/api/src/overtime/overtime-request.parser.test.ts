import { describe, expect, it } from 'vitest';

import {
  OvertimeRequestInvalidError,
  parseOvertimeListRequest,
  parseReviewOvertimeRequest,
  parseSubmitOvertimeRequest,
  parseWithdrawOvertimeRequest,
} from './overtime-request.parser';

const id = '019f7a17-6845-7a90-94cb-e5f5caabd5f6';

describe('overtime request parser', () => {
  it('parses and normalizes a complete overtime request', () => {
    expect(
      parseSubmitOvertimeRequest(id, {
        breakEndMinute: 780,
        breakStartMinute: 720,
        overtimeDate: '2026-07-25',
        reason: ' 周六加班 ',
        workEndMinute: 1080,
        workStartMinute: 540,
      }),
    ).toEqual({
      artistId: id,
      breakEndMinute: 780,
      breakStartMinute: 720,
      overtimeDate: new Date('2026-07-25T00:00:00.000Z'),
      reason: '周六加班',
      workEndMinute: 1080,
      workStartMinute: 540,
    });
  });

  it('parses strict review and withdrawal concurrency fields', () => {
    expect(
      parseReviewOvertimeRequest(id.toUpperCase(), {
        comment: ' 同意 ',
        decision: 'APPROVE',
        expectedRowVersion: 2,
      }),
    ).toEqual({ comment: '同意', decision: 'APPROVE', expectedRowVersion: 2, overtimeId: id });
    expect(parseWithdrawOvertimeRequest(id, { expectedRowVersion: 1 })).toEqual({
      expectedRowVersion: 1,
      overtimeId: id,
    });
  });

  it('parses bounded pagination and status', () => {
    expect(parseOvertimeListRequest({ page: '2', pageSize: '100', status: 'PENDING' })).toEqual({
      page: 2,
      pageSize: 100,
      status: 'PENDING',
    });
  });

  it.each([
    [id, { overtimeDate: '2026-02-30', reason: '加班', workEndMinute: 1080, workStartMinute: 540 }],
    [
      id,
      {
        extra: true,
        overtimeDate: '2026-07-25',
        reason: '加班',
        workEndMinute: 1080,
        workStartMinute: 540,
      },
    ],
    [
      'bad-id',
      { overtimeDate: '2026-07-25', reason: '加班', workEndMinute: 1080, workStartMinute: 540 },
    ],
  ])('rejects malformed or unknown create fields', (artistId, body) => {
    expect(() => parseSubmitOvertimeRequest(artistId, body)).toThrow(OvertimeRequestInvalidError);
  });

  it('rejects invalid review decisions and excessive pagination', () => {
    expect(() =>
      parseReviewOvertimeRequest(id, { decision: 'YES', expectedRowVersion: 1 }),
    ).toThrow(OvertimeRequestInvalidError);
    expect(() => parseOvertimeListRequest({ pageSize: '101' })).toThrow(
      OvertimeRequestInvalidError,
    );
  });
});
