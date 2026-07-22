import { describe, expect, it } from 'vitest';

import { ScheduleRequestInvalidError } from './schedule-board.errors';
import { parseScheduleBoardRequest } from './schedule-request.parser';

const siteId = '019f7a17-6845-7a90-94cb-e5f5caabd5f6';

describe('schedule request parser', () => {
  it('parses an exact business date and optional site', () => {
    expect(parseScheduleBoardRequest({ date: '2026-07-22', siteId })).toEqual({
      date: new Date('2026-07-22T00:00:00.000Z'),
      siteId,
    });
  });

  it('rejects invalid dates and extra scope fields', () => {
    expect(() => parseScheduleBoardRequest({ date: '2026-02-30' })).toThrow(
      ScheduleRequestInvalidError,
    );
    expect(() => parseScheduleBoardRequest({ date: '2026-07-22', role: 'ADMIN' })).toThrow(
      ScheduleRequestInvalidError,
    );
  });
});
