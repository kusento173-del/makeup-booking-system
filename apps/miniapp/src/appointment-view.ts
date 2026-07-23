import type { RoleCode } from './auth-session';
import type { AppointmentListItem, AppointmentStatus } from './appointment-api';

export type ScheduleRange = 'HISTORY' | 'SEVEN_DAYS' | 'TODAY' | 'TOMORROW';

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

export const RANGE_OPTIONS: readonly { readonly id: ScheduleRange; readonly label: string }[] = [
  { id: 'TODAY', label: '今日' },
  { id: 'TOMORROW', label: '明日' },
  { id: 'SEVEN_DAYS', label: '未来七日' },
  { id: 'HISTORY', label: '历史' },
];

export const STATUS_LABELS: Readonly<Record<AppointmentStatus, string>> = {
  BOOKED: '已预约',
  CANCELLED: '已取消',
  COMPLETED: '已完成',
};

function dateAtOffset(offsetDays: number, now: Date): string {
  return DATE_FORMATTER.format(new Date(now.getTime() + offsetDays * 86_400_000));
}

export function scheduleDateRange(range: ScheduleRange, now = new Date(), historyWindow = 0) {
  switch (range) {
    case 'TODAY':
      return { fromDate: dateAtOffset(0, now), toDate: dateAtOffset(0, now) };
    case 'TOMORROW':
      return { fromDate: dateAtOffset(1, now), toDate: dateAtOffset(1, now) };
    case 'SEVEN_DAYS':
      return { fromDate: dateAtOffset(1, now), toDate: dateAtOffset(7, now) };
    case 'HISTORY':
      return {
        fromDate: dateAtOffset(-30 * (historyWindow + 1), now),
        toDate: dateAtOffset(-30 * historyWindow - 1, now),
      };
  }
}

export function appointmentTime(item: AppointmentListItem): string {
  return `${TIME_FORMATTER.format(new Date(item.startAt))}–${TIME_FORMATTER.format(
    new Date(item.endAt),
  )}`;
}

export function appointmentSubject(item: AppointmentListItem, roleCode: RoleCode): string {
  switch (roleCode) {
    case 'ARTIST':
      return `${item.hostName} · ${item.hostCode}`;
    case 'OPERATOR':
      return `${item.hostName} · ${item.artistNickname}`;
    case 'HOST':
      return item.artistNickname;
    case 'ADMIN':
    case 'CUSTOMER_SERVICE':
      return `${item.hostName} · ${item.artistNickname}`;
  }
}

export function canCancelAppointment(
  item: AppointmentListItem,
  roleCode: RoleCode,
  now = new Date(),
): boolean {
  return (
    (roleCode === 'HOST' || roleCode === 'OPERATOR') &&
    item.status === 'BOOKED' &&
    item.date > dateAtOffset(0, now)
  );
}
