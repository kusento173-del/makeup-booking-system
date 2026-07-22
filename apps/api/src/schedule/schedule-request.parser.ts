import { ScheduleRequestInvalidError } from './schedule-board.errors';
import type { ScheduleBoardInput } from './schedule-board.types';

function uuid(value: unknown): string {
  if (typeof value !== 'string') throw new ScheduleRequestInvalidError();
  const normalized = value.normalize('NFKC').trim().toLocaleLowerCase('en-US');
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(normalized)
  ) {
    throw new ScheduleRequestInvalidError();
  }
  return normalized;
}

export function parseScheduleBoardRequest(value: unknown): ScheduleBoardInput {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ScheduleRequestInvalidError();
  }
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((key) => !['date', 'siteId'].includes(key))) {
    throw new ScheduleRequestInvalidError();
  }
  if (typeof input.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    throw new ScheduleRequestInvalidError();
  }
  const date = new Date(`${input.date}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== input.date) {
    throw new ScheduleRequestInvalidError();
  }
  return {
    date,
    ...(input.siteId !== undefined ? { siteId: uuid(input.siteId) } : {}),
  };
}
