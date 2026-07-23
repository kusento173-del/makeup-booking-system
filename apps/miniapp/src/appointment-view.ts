import type { RoleCode } from './auth-session';
import type { AppointmentListItem } from './appointment-api';

export type ScheduleRange = 'SEVEN_DAYS' | 'TODAY' | 'TOMORROW';

const DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  day: '2-digit',
  month: '2-digit',
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
});
const TIME_FORMATTER = new Intl.DateTimeFormat('zh-CN', {
  hour: '2-digit',
  hour12: false,
  minute: '2-digit',
  timeZone: 'Asia/Shanghai',
});

function dateAtOffset(offsetDays: number, now: Date): string {
  return DATE_FORMATTER.format(new Date(now.getTime() + offsetDays * 86_400_000));
}

export function scheduleDateRange(range: ScheduleRange, now = new Date()) {
  const fromOffset = range === 'TODAY' ? 0 : 1;
  const toOffset = range === 'SEVEN_DAYS' ? 7 : fromOffset;
  return {
    fromDate: dateAtOffset(fromOffset, now),
    toDate: dateAtOffset(toOffset, now),
  };
}

export function appointmentTime(item: AppointmentListItem): string {
  return `${TIME_FORMATTER.format(new Date(item.startAt))}–${TIME_FORMATTER.format(
    new Date(item.endAt),
  )}`;
}

export function appointmentSubject(item: AppointmentListItem, roleCode: RoleCode): string {
  return roleCode === 'ARTIST'
    ? `${item.hostName} · ${item.hostCode}`
    : roleCode === 'OPERATOR'
      ? `${item.hostName} · ${item.artistNickname}`
      : item.artistNickname;
}

export function canChangeAppointment(item: AppointmentListItem, now = new Date()): boolean {
  return item.status === 'BOOKED' && item.date > dateAtOffset(0, now);
}
