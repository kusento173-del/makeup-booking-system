const BUSINESS_DATE = new Intl.DateTimeFormat('en-CA', {
  day: '2-digit',
  month: '2-digit',
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
});

const WEEKDAY = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai',
  weekday: 'short',
});

export function businessDate(offsetDays = 0): string {
  return BUSINESS_DATE.format(new Date(Date.now() + offsetDays * 86_400_000));
}

export function bookingDates(): readonly { readonly date: string; readonly label: string }[] {
  return Array.from({ length: 7 }, (_, index) => {
    const offsetDays = index + 1;
    const value = new Date(Date.now() + offsetDays * 86_400_000);
    return {
      date: BUSINESS_DATE.format(value),
      label: index === 0 ? '明天' : WEEKDAY.format(value),
    };
  });
}

export function minuteLabel(minute: number): string {
  const hours = Math.floor(minute / 60);
  const minutes = minute % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function isoTimeLabel(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    hour12: false,
    minute: '2-digit',
    timeZone: 'Asia/Shanghai',
  }).format(new Date(value));
}

export function timeToMinute(value: string): number {
  const [hours, minutes] = value.split(':').map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

export const WEEKDAYS = [
  { id: 1, label: '周一' },
  { id: 2, label: '周二' },
  { id: 3, label: '周三' },
  { id: 4, label: '周四' },
  { id: 5, label: '周五' },
  { id: 6, label: '周六' },
  { id: 7, label: '周日' },
] as const;
