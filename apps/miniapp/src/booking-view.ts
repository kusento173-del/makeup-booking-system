const DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  day: '2-digit',
  month: '2-digit',
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
});
const WEEKDAY_FORMATTER = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai',
  weekday: 'short',
});

export interface BookingDateOption {
  readonly date: string;
  readonly day: string;
  readonly weekday: string;
}

export function bookingDateOptions(now = new Date()): readonly BookingDateOption[] {
  return Array.from({ length: 7 }, (_, index) => {
    const value = new Date(now.getTime() + (index + 1) * 86_400_000);
    const date = DATE_FORMATTER.format(value);
    return {
      date,
      day: date.slice(5),
      weekday: WEEKDAY_FORMATTER.format(value),
    };
  });
}

export function createIdempotencyKey(now = Date.now(), random = Math.random): string {
  const seed = `${now.toString(16).padStart(12, '0')}${Math.floor(random() * 0xffffffffffff)
    .toString(16)
    .padStart(12, '0')}`;
  return `${seed.slice(0, 8)}-${seed.slice(8, 12)}-4${seed.slice(13, 16)}-a${seed.slice(
    17,
    20,
  )}-${seed.slice(20).padEnd(12, '0')}`;
}
