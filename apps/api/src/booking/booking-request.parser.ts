import type {
  CancelBookingCommand,
  CreateBookingCommand,
  RescheduleBookingCommand,
} from './booking-create.types';
import { toBusinessDate } from '../shift/business-date';
import type { AppointmentDisplayStatus, AppointmentListInput } from './appointment-query.types';
import type { BookingSlotInput } from './booking-slot.types';

export class BookingRequestInvalidError extends Error {
  readonly code = 'INVALID_REQUEST';
  constructor() {
    super('The booking request is invalid');
    this.name = 'BookingRequestInvalidError';
  }
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new BookingRequestInvalidError();
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, allowedKeys: readonly string[]): void {
  const allowed = new Set(allowedKeys);
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    throw new BookingRequestInvalidError();
  }
}

function uuid(value: unknown): string {
  if (typeof value !== 'string') throw new BookingRequestInvalidError();
  const result = value.normalize('NFKC').trim().toLocaleLowerCase('en-US');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(result)) {
    throw new BookingRequestInvalidError();
  }
  return result;
}

function dateOnly(value: unknown): Date {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new BookingRequestInvalidError();
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new BookingRequestInvalidError();
  }
  return date;
}

function integer(value: unknown, allowString: boolean): number {
  const result =
    allowString && typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  if (typeof result !== 'number' || !Number.isSafeInteger(result)) {
    throw new BookingRequestInvalidError();
  }
  return result;
}

function idempotencyKey(value: unknown): string {
  if (typeof value !== 'string') throw new BookingRequestInvalidError();
  return value;
}

export function parseBookingSlotsRequest(query: unknown): BookingSlotInput {
  const input = record(query);
  exactKeys(input, ['artistId', 'date', 'durationMinutes', 'hostId']);
  return {
    artistId: uuid(input.artistId),
    date: dateOnly(input.date),
    durationMinutes: integer(input.durationMinutes, true),
    hostId: uuid(input.hostId),
  };
}

export function parseCreateBookingRequest(
  body: unknown,
  idempotencyHeader: unknown,
): CreateBookingCommand {
  const input = record(body);
  exactKeys(input, [
    'artistId',
    'confirmedSecondBooking',
    'date',
    'durationMinutes',
    'hostId',
    'startMinute',
  ]);
  if (
    input.confirmedSecondBooking !== undefined &&
    typeof input.confirmedSecondBooking !== 'boolean'
  ) {
    throw new BookingRequestInvalidError();
  }
  return {
    artistId: uuid(input.artistId),
    confirmedSecondBooking: input.confirmedSecondBooking ?? false,
    date: dateOnly(input.date),
    durationMinutes: integer(input.durationMinutes, false),
    hostId: uuid(input.hostId),
    idempotencyKey: idempotencyKey(idempotencyHeader),
    startMinute: integer(input.startMinute, false),
  };
}

export function parseCancelBookingRequest(
  appointmentId: unknown,
  body: unknown,
): CancelBookingCommand {
  const input = record(body);
  exactKeys(input, ['expectedRowVersion', 'reason']);
  const expectedRowVersion = integer(input.expectedRowVersion, false);
  if (expectedRowVersion < 1) throw new BookingRequestInvalidError();
  if (input.reason !== undefined && typeof input.reason !== 'string') {
    throw new BookingRequestInvalidError();
  }
  return {
    appointmentId: uuid(appointmentId),
    expectedRowVersion,
    ...(input.reason !== undefined ? { reason: input.reason } : {}),
  };
}

export function parseRescheduleBookingRequest(
  appointmentId: unknown,
  body: unknown,
  idempotencyHeader: unknown,
): RescheduleBookingCommand {
  const input = record(body);
  exactKeys(input, [
    'artistId',
    'confirmedSecondBooking',
    'date',
    'durationMinutes',
    'expectedRowVersion',
    'reason',
    'startMinute',
  ]);
  const expectedRowVersion = integer(input.expectedRowVersion, false);
  if (expectedRowVersion < 1) throw new BookingRequestInvalidError();
  if (
    input.confirmedSecondBooking !== undefined &&
    typeof input.confirmedSecondBooking !== 'boolean'
  ) {
    throw new BookingRequestInvalidError();
  }
  if (input.reason !== undefined && typeof input.reason !== 'string') {
    throw new BookingRequestInvalidError();
  }
  return {
    appointmentId: uuid(appointmentId),
    artistId: uuid(input.artistId),
    confirmedSecondBooking: input.confirmedSecondBooking ?? false,
    date: dateOnly(input.date),
    durationMinutes: integer(input.durationMinutes, false),
    expectedRowVersion,
    idempotencyKey: idempotencyKey(idempotencyHeader),
    ...(input.reason !== undefined ? { reason: input.reason } : {}),
    startMinute: integer(input.startMinute, false),
  };
}

export function parseAppointmentListRequest(
  query: unknown,
  now = new Date(),
): AppointmentListInput {
  const input = record(query);
  exactKeys(input, ['fromDate', 'page', 'pageSize', 'status', 'toDate']);
  const fromDate = input.fromDate === undefined ? toBusinessDate(now) : dateOnly(input.fromDate);
  const toDate = input.toDate === undefined ? fromDate : dateOnly(input.toDate);
  const rangeDays = Math.round((toDate.getTime() - fromDate.getTime()) / 86_400_000) + 1;
  if (rangeDays < 1 || rangeDays > 31) throw new BookingRequestInvalidError();
  const page = input.page === undefined ? 1 : integer(input.page, true);
  const pageSize = input.pageSize === undefined ? 50 : integer(input.pageSize, true);
  if (page < 1 || pageSize < 1 || pageSize > 100) throw new BookingRequestInvalidError();
  const statuses: readonly AppointmentDisplayStatus[] = ['BOOKED', 'CANCELLED', 'COMPLETED'];
  if (input.status !== undefined && !statuses.includes(input.status as AppointmentDisplayStatus)) {
    throw new BookingRequestInvalidError();
  }
  return {
    fromDate,
    page,
    pageSize,
    ...(input.status ? { status: input.status as AppointmentDisplayStatus } : {}),
    toDate,
  };
}
