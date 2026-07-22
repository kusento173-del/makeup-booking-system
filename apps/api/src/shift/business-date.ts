const BUSINESS_TIME_ZONE = 'Asia/Shanghai';
const BUSINESS_UTC_OFFSET_MINUTES = 8 * 60;
const BUSINESS_DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  day: '2-digit',
  month: '2-digit',
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
});

export function toBusinessDate(now: Date): Date {
  const parts = Object.fromEntries(
    BUSINESS_DATE_FORMATTER.formatToParts(now).map(({ type, value }) => [type, value]),
  );
  return new Date(`${parts.year}-${parts.month}-${parts.day}T00:00:00.000Z`);
}

export function formatDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function isoWeekdayForDate(value: Date): number {
  return value.getUTCDay() || 7;
}

export function businessDateMinuteToInstant(date: Date, minute: number): Date {
  return new Date(date.getTime() + (minute - BUSINESS_UTC_OFFSET_MINUTES) * 60_000);
}

export function instantToBusinessDateMinute(date: Date, instant: Date): number {
  return Math.round((instant.getTime() - date.getTime()) / 60_000) + BUSINESS_UTC_OFFSET_MINUTES;
}
