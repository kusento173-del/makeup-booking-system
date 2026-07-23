const WEEKDAY_LABELS: Readonly<Record<number, string>> = {
  1: '周一',
  2: '周二',
  3: '周三',
  4: '周四',
  5: '周五',
  6: '周六',
  7: '周日',
};

export function timeToMinute(value: string): number {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return Number.NaN;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function minuteToTime(value: number): string {
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}

export function workdayText(workdays: readonly number[]): string {
  return [...workdays]
    .sort((left, right) => left - right)
    .map((weekday) => WEEKDAY_LABELS[weekday] ?? '')
    .filter(Boolean)
    .join('、');
}

export function validateShiftTimes(input: {
  readonly breakEndMinute: number | null;
  readonly breakStartMinute: number | null;
  readonly workEndMinute: number;
  readonly workStartMinute: number;
}): string | null {
  const values = [
    input.workStartMinute,
    input.workEndMinute,
    ...(input.breakStartMinute === null ? [] : [input.breakStartMinute]),
    ...(input.breakEndMinute === null ? [] : [input.breakEndMinute]),
  ];
  if (values.some((value) => !Number.isSafeInteger(value) || value % 15 !== 0)) {
    return '所有时间必须选择整点、15 分、30 分或 45 分';
  }
  if (input.workStartMinute >= input.workEndMinute) return '下班时间必须晚于上班时间';
  if (
    input.breakStartMinute !== null &&
    input.breakEndMinute !== null &&
    (input.breakStartMinute <= input.workStartMinute ||
      input.breakStartMinute >= input.breakEndMinute ||
      input.breakEndMinute >= input.workEndMinute)
  ) {
    return '午休必须完整位于上班和下班时间之间';
  }
  return null;
}
