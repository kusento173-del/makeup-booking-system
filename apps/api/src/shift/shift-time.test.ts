import { describe, expect, it } from 'vitest';

import {
  canFitInShift,
  listShiftStartMinutes,
  type ShiftDefinition,
  ShiftDefinitionInvalidError,
  validateShiftDefinition,
  workIntervalsForWeekday,
} from './shift-time';

const STANDARD_SHIFT: ShiftDefinition = {
  breakEndMinute: 13 * 60,
  breakStartMinute: 12 * 60,
  workEndMinute: 18 * 60,
  workStartMinute: 9 * 60,
  workdays: [1, 2, 3, 4, 5],
};

function invalidReason(definition: ShiftDefinition): string | undefined {
  try {
    validateShiftDefinition(definition);
    return undefined;
  } catch (cause) {
    return cause instanceof ShiftDefinitionInvalidError ? cause.reason : undefined;
  }
}

describe('shift time rules', () => {
  it('accepts one shared shift for any non-empty set of ISO weekdays', () => {
    expect(() => validateShiftDefinition(STANDARD_SHIFT)).not.toThrow();
    expect(() =>
      validateShiftDefinition({
        ...STANDARD_SHIFT,
        breakEndMinute: null,
        breakStartMinute: null,
        workEndMinute: 24 * 60,
        workStartMinute: 0,
        workdays: [1, 2, 3, 4, 5, 6, 7],
      }),
    ).not.toThrow();
  });

  it.each([
    [{ ...STANDARD_SHIFT, workdays: [] }, 'WORKDAYS_EMPTY'],
    [{ ...STANDARD_SHIFT, workdays: [1, 1] }, 'WORKDAY_DUPLICATED'],
    [{ ...STANDARD_SHIFT, workdays: [0] }, 'WORKDAY_INVALID'],
    [{ ...STANDARD_SHIFT, workStartMinute: 9 * 60 + 1 }, 'TIME_STEP_INVALID'],
    [{ ...STANDARD_SHIFT, workEndMinute: 24 * 60 + 15 }, 'TIME_OUT_OF_RANGE'],
    [{ ...STANDARD_SHIFT, workEndMinute: 9 * 60 }, 'WORK_TIME_ORDER_INVALID'],
    [{ ...STANDARD_SHIFT, breakEndMinute: null }, 'BREAK_PAIR_INCOMPLETE'],
    [{ ...STANDARD_SHIFT, breakEndMinute: 12 * 60 }, 'BREAK_TIME_ORDER_INVALID'],
    [{ ...STANDARD_SHIFT, breakStartMinute: 8 * 60 }, 'BREAK_TIME_ORDER_INVALID'],
  ] as const)('rejects an invalid definition with a stable reason', (definition, reason) => {
    expect(invalidReason(definition)).toBe(reason);
  });

  it('returns left-closed, right-open continuous working intervals', () => {
    expect(workIntervalsForWeekday(STANDARD_SHIFT, 1)).toEqual([
      { endMinute: 12 * 60, startMinute: 9 * 60 },
      { endMinute: 18 * 60, startMinute: 13 * 60 },
    ]);
    expect(workIntervalsForWeekday(STANDARD_SHIFT, 7)).toEqual([]);
  });

  it('checks the complete service duration against lunch and closing time', () => {
    expect(canFitInShift(STANDARD_SHIFT, 1, 11 * 60 + 45, 15)).toBe(true);
    expect(canFitInShift(STANDARD_SHIFT, 1, 11 * 60 + 45, 30)).toBe(false);
    expect(canFitInShift(STANDARD_SHIFT, 1, 17 * 60 + 30, 30)).toBe(true);
    expect(canFitInShift(STANDARD_SHIFT, 1, 17 * 60 + 45, 30)).toBe(false);
    expect(canFitInShift(STANDARD_SHIFT, 7, 10 * 60, 30)).toBe(false);
  });

  it('lists every aligned start that contains the full requested duration', () => {
    expect(listShiftStartMinutes(STANDARD_SHIFT, 1, 30)).toEqual([
      540, 555, 570, 585, 600, 615, 630, 645, 660, 675, 690, 780, 795, 810, 825, 840, 855, 870, 885,
      900, 915, 930, 945, 960, 975, 990, 1005, 1020, 1035, 1050,
    ]);
  });

  it('preserves interval and alignment invariants across many valid shifts', () => {
    for (let workStartMinute = 6 * 60; workStartMinute <= 10 * 60; workStartMinute += 15) {
      for (let durationMinutes = 15; durationMinutes <= 60; durationMinutes += 15) {
        const definition: ShiftDefinition = {
          breakEndMinute: 13 * 60,
          breakStartMinute: 12 * 60,
          workEndMinute: 20 * 60,
          workStartMinute,
          workdays: [3],
        };
        const starts = listShiftStartMinutes(definition, 3, durationMinutes);
        expect(starts.every((start) => start % 15 === 0)).toBe(true);
        expect(starts.every((start) => canFitInShift(definition, 3, start, durationMinutes))).toBe(
          true,
        );
      }
    }
  });
});
