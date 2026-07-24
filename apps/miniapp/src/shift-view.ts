import type { ShiftDefinition } from './shift-api';

export const WEEKDAYS = [
  { label: '周一', value: 1 },
  { label: '周二', value: 2 },
  { label: '周三', value: 3 },
  { label: '周四', value: 4 },
  { label: '周五', value: 5 },
  { label: '周六', value: 6 },
  { label: '周日', value: 7 },
] as const;

function timeOptions(start: number, end: number) {
  return Array.from({ length: (end - start) / 15 + 1 }, (_, index) => {
    const value = start + index * 15;
    return { label: minuteLabel(value), value };
  });
}

export const START_TIME_OPTIONS = timeOptions(0, 1425);
export const END_TIME_OPTIONS = timeOptions(15, 1440);

export function minuteLabel(minute: number): string {
  const hours = Math.floor(minute / 60);
  const minutes = minute % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function optionIndex(
  options: readonly { readonly value: number }[],
  minute: number,
): number {
  const index = options.findIndex((option) => option.value === minute);
  return index < 0 ? 0 : index;
}

export function workdayLabel(workdays: readonly number[]): string {
  return WEEKDAYS.filter((weekday) => workdays.includes(weekday.value))
    .map((weekday) => weekday.label)
    .join('、');
}

export function validateShiftDefinition(definition: ShiftDefinition): string | null {
  if (definition.workdays.length === 0) return '请至少选择一个工作日。';
  if (definition.workStartMinute >= definition.workEndMinute) {
    return '下班时间必须晚于上班时间。';
  }

  const hasBreakStart = definition.breakStartMinute !== null;
  const hasBreakEnd = definition.breakEndMinute !== null;
  if (hasBreakStart !== hasBreakEnd) return '午休开始和结束时间必须同时设置。';
  if (
    hasBreakStart &&
    hasBreakEnd &&
    (definition.workStartMinute >= definition.breakStartMinute ||
      definition.breakStartMinute >= definition.breakEndMinute ||
      definition.breakEndMinute >= definition.workEndMinute)
  ) {
    return '午休时间必须完整位于上班和下班时间之间。';
  }
  return null;
}

export function shiftTimeLabel(definition: ShiftDefinition): string {
  const work = `${minuteLabel(definition.workStartMinute)}–${minuteLabel(definition.workEndMinute)}`;
  return definition.breakStartMinute === null || definition.breakEndMinute === null
    ? `${work}（无午休）`
    : `${work}，午休 ${minuteLabel(definition.breakStartMinute)}–${minuteLabel(
        definition.breakEndMinute,
      )}`;
}
