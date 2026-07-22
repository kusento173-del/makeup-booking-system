const BUSINESS_TIME_ZONE = 'Asia/Shanghai';

export function currentBusinessDate(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
  }).format(now);
}

export function addBusinessDays(date: string, days: number): string {
  const instant = new Date(`${date}T00:00:00+08:00`);
  instant.setUTCDate(instant.getUTCDate() + days);
  return new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
  }).format(instant);
}

export function businessDateLabel(date: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: BUSINESS_TIME_ZONE,
    weekday: 'short',
  }).format(new Date(`${date}T00:00:00+08:00`));
}
