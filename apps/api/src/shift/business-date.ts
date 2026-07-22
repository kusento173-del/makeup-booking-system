const BUSINESS_TIME_ZONE = 'Asia/Shanghai';
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
