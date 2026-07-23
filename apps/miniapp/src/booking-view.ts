import type { BookingDuration, BookingSlot } from './booking-api';

const BUSINESS_DATE = new Intl.DateTimeFormat('en-CA', {
  day: '2-digit',
  month: '2-digit',
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
});
const DATE_LABEL = new Intl.DateTimeFormat('zh-CN', {
  day: 'numeric',
  month: 'numeric',
  timeZone: 'Asia/Shanghai',
  weekday: 'short',
});
const TIME_LABEL = new Intl.DateTimeFormat('zh-CN', {
  hour: '2-digit',
  hour12: false,
  minute: '2-digit',
  timeZone: 'Asia/Shanghai',
});

export const BOOKING_DURATIONS: readonly BookingDuration[] = [15, 30, 45, 60];

export const UNAVAILABLE_LABELS: Readonly<Record<string, string>> = {
  ARTIST_INACTIVE: '该化妆师当前不可预约',
  ARTIST_ON_LEAVE: '该化妆师当天请假',
  HOST_DAILY_LIMIT_REACHED: '当天已经预约两次，不能继续预约',
  HOST_INELIGIBLE: '当前主播没有预约资格',
  HOST_ON_LEAVE: '当天处于请假状态，不能预约',
  HOST_SITE_INACTIVE: '所属场地当前不可预约',
  NON_WORKING_WEEKDAY: '该化妆师当天不工作',
  SHIFT_NOT_CONFIGURED: '该化妆师尚未设置班次',
};

export function futureBookingDates(now = new Date()) {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(now.getTime() + (index + 1) * 86_400_000);
    return {
      date: BUSINESS_DATE.format(date),
      label: DATE_LABEL.format(date),
    };
  });
}

export function slotTime(slot: Pick<BookingSlot, 'endAt' | 'startAt'>): string {
  return `${TIME_LABEL.format(new Date(slot.startAt))}–${TIME_LABEL.format(new Date(slot.endAt))}`;
}

export function createIdempotencyKey(now = Date.now(), random = Math.random()): string {
  const suffix = Math.floor(random * 1_000_000_000_000)
    .toString(36)
    .padStart(8, '0');
  return `miniapp-booking-${now}-${suffix}`;
}

export function bookingSignature(input: {
  readonly artistId: string;
  readonly date: string;
  readonly durationMinutes: BookingDuration;
  readonly startMinute: number;
}): string {
  return [input.artistId, input.date, input.durationMinutes, input.startMinute].join(':');
}
