import type {
  DirectShiftChangeCommand,
  ReviewShiftChangeCommand,
  SetInitialShiftCommand,
  ShiftChangePageInput,
  ShiftChangeSummary,
  SubmitShiftChangeCommand,
  WithdrawShiftChangeCommand,
} from './shift.types';

export class ShiftRequestInvalidError extends Error {
  readonly code = 'INVALID_REQUEST';

  constructor() {
    super('The shift request is invalid');
    this.name = 'ShiftRequestInvalidError';
  }
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ShiftRequestInvalidError();
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, allowedKeys: readonly string[]): void {
  const allowed = new Set(allowedKeys);
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    throw new ShiftRequestInvalidError();
  }
}

function integer(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new ShiftRequestInvalidError();
  }
  return value;
}

function positiveInteger(value: unknown, fallback?: number): number {
  if (value === undefined && fallback !== undefined) {
    return fallback;
  }
  const result = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : integer(value);
  if (result < 1) {
    throw new ShiftRequestInvalidError();
  }
  return result;
}

function optionalText(value: unknown, maximumLength: number): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new ShiftRequestInvalidError();
  }
  const result = value.normalize('NFKC').trim();
  if (!result || result.length > maximumLength) {
    throw new ShiftRequestInvalidError();
  }
  return result;
}

function requiredText(value: unknown, maximumLength: number): string {
  const result = optionalText(value, maximumLength);
  if (!result) {
    throw new ShiftRequestInvalidError();
  }
  return result;
}

function dateOnly(value: unknown): Date {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ShiftRequestInvalidError();
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new ShiftRequestInvalidError();
  }
  return date;
}

function nullableInteger(value: unknown): number | null {
  return value === null || value === undefined ? null : integer(value);
}

function shiftFields(input: Record<string, unknown>) {
  if (!Array.isArray(input.workdays)) {
    throw new ShiftRequestInvalidError();
  }
  return {
    breakEndMinute: nullableInteger(input.breakEndMinute),
    breakStartMinute: nullableInteger(input.breakStartMinute),
    workEndMinute: integer(input.workEndMinute),
    workStartMinute: integer(input.workStartMinute),
    workdays: input.workdays.map(integer),
  };
}

export function parseArtistId(value: unknown): string {
  if (typeof value !== 'string') {
    throw new ShiftRequestInvalidError();
  }
  const id = value.normalize('NFKC').trim().toLocaleLowerCase('en-US');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)) {
    throw new ShiftRequestInvalidError();
  }
  return id;
}

export function parseInitialShiftRequest(artistId: unknown, body: unknown): SetInitialShiftCommand {
  const input = record(body);
  exactKeys(input, [
    'breakEndMinute',
    'breakStartMinute',
    'workEndMinute',
    'workStartMinute',
    'workdays',
  ]);
  return {
    artistId: parseArtistId(artistId),
    ...shiftFields(input),
  };
}

export function parseSubmitShiftChangeRequest(
  artistId: unknown,
  body: unknown,
): SubmitShiftChangeCommand {
  const input = record(body);
  exactKeys(input, [
    'breakEndMinute',
    'breakStartMinute',
    'effectiveFrom',
    'reason',
    'workEndMinute',
    'workStartMinute',
    'workdays',
  ]);
  return {
    artistId: parseArtistId(artistId),
    effectiveFrom: dateOnly(input.effectiveFrom),
    reason: requiredText(input.reason, 500),
    ...shiftFields(input),
  };
}

export function parseDirectShiftChangeRequest(
  artistId: unknown,
  body: unknown,
): DirectShiftChangeCommand {
  const input = record(body);
  exactKeys(input, [
    'breakEndMinute',
    'breakStartMinute',
    'effectiveFrom',
    'expectedVersionNo',
    'reason',
    'workEndMinute',
    'workStartMinute',
    'workdays',
  ]);
  return {
    artistId: parseArtistId(artistId),
    effectiveFrom: dateOnly(input.effectiveFrom),
    expectedVersionNo: positiveInteger(input.expectedVersionNo),
    reason: requiredText(input.reason, 500),
    ...shiftFields(input),
  };
}

export function parseWithdrawShiftChangeRequest(
  requestId: unknown,
  body: unknown,
): WithdrawShiftChangeCommand {
  const input = record(body);
  exactKeys(input, ['expectedRowVersion']);
  return {
    expectedRowVersion: positiveInteger(input.expectedRowVersion),
    requestId: parseArtistId(requestId),
  };
}

export function parseReviewShiftChangeRequest(
  requestId: unknown,
  body: unknown,
): ReviewShiftChangeCommand {
  const input = record(body);
  exactKeys(input, ['comment', 'decision', 'expectedRowVersion']);
  if (input.decision !== 'APPROVE' && input.decision !== 'REJECT') {
    throw new ShiftRequestInvalidError();
  }
  return {
    ...(input.comment === undefined ? {} : { comment: requiredText(input.comment, 500) }),
    decision: input.decision,
    expectedRowVersion: positiveInteger(input.expectedRowVersion),
    requestId: parseArtistId(requestId),
  };
}

const SHIFT_CHANGE_STATUSES: readonly ShiftChangeSummary['status'][] = [
  'APPROVED',
  'PENDING',
  'REJECTED',
  'WITHDRAWN',
];

export function parseShiftChangeListRequest(query: unknown): ShiftChangePageInput {
  const input = record(query);
  exactKeys(input, ['page', 'pageSize', 'status']);
  const status = input.status;
  if (
    status !== undefined &&
    !SHIFT_CHANGE_STATUSES.includes(status as ShiftChangeSummary['status'])
  ) {
    throw new ShiftRequestInvalidError();
  }
  const pageSize = positiveInteger(input.pageSize, 50);
  if (pageSize > 100) {
    throw new ShiftRequestInvalidError();
  }
  return {
    page: positiveInteger(input.page, 1),
    pageSize,
    ...(status ? { status: status as ShiftChangeSummary['status'] } : {}),
  };
}

export function assertNoShiftQuery(query: unknown): void {
  const input = record(query);
  exactKeys(input, []);
}
