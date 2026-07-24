const MINUTES_PER_DAY = 24 * 60;
const TIME_STEP_MINUTES = 15;

export type ShiftValidationReason =
  | 'BREAK_PAIR_INCOMPLETE'
  | 'BREAK_TIME_ORDER_INVALID'
  | 'TIME_OUT_OF_RANGE'
  | 'TIME_STEP_INVALID'
  | 'WORKDAY_DUPLICATED'
  | 'WORKDAY_INVALID'
  | 'WORKDAYS_EMPTY'
  | 'WORK_TIME_ORDER_INVALID';

export interface ShiftDefinition {
  readonly breakEndMinute: number | null;
  readonly breakStartMinute: number | null;
  readonly workEndMinute: number;
  readonly workStartMinute: number;
  readonly workdays: readonly number[];
}

export interface MinuteInterval {
  readonly endMinute: number;
  readonly startMinute: number;
}

export function subtractMinuteIntervals(
  intervals: readonly MinuteInterval[],
  blockedIntervals: readonly MinuteInterval[],
): readonly MinuteInterval[] {
  return blockedIntervals.reduce<readonly MinuteInterval[]>(
    (remaining, blocked) =>
      remaining.flatMap((interval) => {
        if (
          blocked.endMinute <= interval.startMinute ||
          blocked.startMinute >= interval.endMinute
        ) {
          return [interval];
        }

        return [
          ...(blocked.startMinute > interval.startMinute
            ? [{ endMinute: blocked.startMinute, startMinute: interval.startMinute }]
            : []),
          ...(blocked.endMinute < interval.endMinute
            ? [{ endMinute: interval.endMinute, startMinute: blocked.endMinute }]
            : []),
        ];
      }),
    intervals,
  );
}

export class ShiftDefinitionInvalidError extends Error {
  readonly code = 'SHIFT_DEFINITION_INVALID';

  constructor(readonly reason: ShiftValidationReason) {
    super(`Invalid shift definition: ${reason}`);
    this.name = 'ShiftDefinitionInvalidError';
  }
}

function invalid(reason: ShiftValidationReason): never {
  throw new ShiftDefinitionInvalidError(reason);
}

function validMinute(value: number, allowEndOfDay: boolean): boolean {
  const maximum = allowEndOfDay ? MINUTES_PER_DAY : MINUTES_PER_DAY - 1;
  return Number.isSafeInteger(value) && value >= 0 && value <= maximum;
}

function assertMinute(value: number, allowEndOfDay: boolean): void {
  if (!validMinute(value, allowEndOfDay)) {
    invalid('TIME_OUT_OF_RANGE');
  }
  if (value % TIME_STEP_MINUTES !== 0) {
    invalid('TIME_STEP_INVALID');
  }
}

function assertIsoWeekday(isoWeekday: number): void {
  if (!Number.isSafeInteger(isoWeekday) || isoWeekday < 1 || isoWeekday > 7) {
    invalid('WORKDAY_INVALID');
  }
}

export function validateShiftDefinition(definition: ShiftDefinition): void {
  if (definition.workdays.length === 0) {
    invalid('WORKDAYS_EMPTY');
  }

  const uniqueWorkdays = new Set<number>();
  for (const workday of definition.workdays) {
    assertIsoWeekday(workday);
    if (uniqueWorkdays.has(workday)) {
      invalid('WORKDAY_DUPLICATED');
    }
    uniqueWorkdays.add(workday);
  }

  assertMinute(definition.workStartMinute, false);
  assertMinute(definition.workEndMinute, true);
  if (definition.workStartMinute >= definition.workEndMinute) {
    invalid('WORK_TIME_ORDER_INVALID');
  }

  const hasBreakStart = definition.breakStartMinute !== null;
  const hasBreakEnd = definition.breakEndMinute !== null;
  if (hasBreakStart !== hasBreakEnd) {
    invalid('BREAK_PAIR_INCOMPLETE');
  }
  if (!hasBreakStart || !hasBreakEnd) {
    return;
  }

  const breakStartMinute = definition.breakStartMinute;
  const breakEndMinute = definition.breakEndMinute;
  assertMinute(breakStartMinute, false);
  assertMinute(breakEndMinute, false);
  if (
    definition.workStartMinute >= breakStartMinute ||
    breakStartMinute >= breakEndMinute ||
    breakEndMinute >= definition.workEndMinute
  ) {
    invalid('BREAK_TIME_ORDER_INVALID');
  }
}

export function workIntervalsForWeekday(
  definition: ShiftDefinition,
  isoWeekday: number,
): readonly MinuteInterval[] {
  validateShiftDefinition(definition);
  assertIsoWeekday(isoWeekday);
  if (!definition.workdays.includes(isoWeekday)) {
    return [];
  }
  if (definition.breakStartMinute === null || definition.breakEndMinute === null) {
    return [{ endMinute: definition.workEndMinute, startMinute: definition.workStartMinute }];
  }
  return [
    { endMinute: definition.breakStartMinute, startMinute: definition.workStartMinute },
    { endMinute: definition.workEndMinute, startMinute: definition.breakEndMinute },
  ];
}

export function canFitInShift(
  definition: ShiftDefinition,
  isoWeekday: number,
  startMinute: number,
  durationMinutes: number,
): boolean {
  assertMinute(startMinute, false);
  if (
    !Number.isSafeInteger(durationMinutes) ||
    durationMinutes <= 0 ||
    durationMinutes % TIME_STEP_MINUTES !== 0
  ) {
    invalid('TIME_STEP_INVALID');
  }
  const endMinute = startMinute + durationMinutes;
  return workIntervalsForWeekday(definition, isoWeekday).some(
    (interval) => startMinute >= interval.startMinute && endMinute <= interval.endMinute,
  );
}

export function listShiftStartMinutes(
  definition: ShiftDefinition,
  isoWeekday: number,
  durationMinutes: number,
): readonly number[] {
  if (
    !Number.isSafeInteger(durationMinutes) ||
    durationMinutes <= 0 ||
    durationMinutes % TIME_STEP_MINUTES !== 0
  ) {
    invalid('TIME_STEP_INVALID');
  }

  return workIntervalsForWeekday(definition, isoWeekday).flatMap((interval) => {
    const starts: number[] = [];
    for (
      let start = interval.startMinute;
      start + durationMinutes <= interval.endMinute;
      start += TIME_STEP_MINUTES
    ) {
      starts.push(start);
    }
    return starts;
  });
}
