import { businessDateMinuteToInstant, toBusinessDate } from '../shift/business-date';
import type { MinuteInterval } from '../shift/shift-time';
import { BookingDateInvalidError, BookingDurationInvalidError } from './booking-time.errors';

const DURATIONS = new Set([15, 30, 45, 60]);

export interface InstantInterval {
  readonly endAt: Date;
  readonly startAt: Date;
}

export function validateBookingDate(date: Date, now: Date): void {
  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCHours() !== 0 ||
    date.getUTCMinutes() !== 0 ||
    date.getUTCSeconds() !== 0 ||
    date.getUTCMilliseconds() !== 0
  ) {
    throw new BookingDateInvalidError();
  }
  const today = toBusinessDate(now);
  const tomorrow = new Date(today);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const lastDate = new Date(today);
  lastDate.setUTCDate(lastDate.getUTCDate() + 7);
  if (date < tomorrow || date > lastDate) throw new BookingDateInvalidError();
}

export function validateBookingDuration(durationMinutes: number): void {
  if (!DURATIONS.has(durationMinutes)) throw new BookingDurationInvalidError();
}

export function listFreeStartMinutes(
  date: Date,
  workIntervals: readonly MinuteInterval[],
  durationMinutes: number,
  blockedIntervals: readonly InstantInterval[],
): readonly number[] {
  validateBookingDuration(durationMinutes);
  return workIntervals.flatMap((workInterval) => {
    const starts: number[] = [];
    for (
      let startMinute = workInterval.startMinute;
      startMinute + durationMinutes <= workInterval.endMinute;
      startMinute += 15
    ) {
      const startAt = businessDateMinuteToInstant(date, startMinute);
      const endAt = new Date(startAt.getTime() + durationMinutes * 60_000);
      if (!blockedIntervals.some((blocked) => startAt < blocked.endAt && blocked.startAt < endAt)) {
        starts.push(startMinute);
      }
    }
    return starts;
  });
}
