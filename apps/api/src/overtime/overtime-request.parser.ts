import type {
  DirectApproveOvertimeCommand,
  OvertimePageInput,
  OvertimeSummary,
  ReviewOvertimeCommand,
  SubmitOvertimeCommand,
  WithdrawOvertimeCommand,
} from './overtime.types';

export class OvertimeRequestInvalidError extends Error {
  readonly code = 'INVALID_REQUEST';
  constructor() {
    super('The overtime request is invalid');
    this.name = 'OvertimeRequestInvalidError';
  }
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new OvertimeRequestInvalidError();
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, allowedKeys: readonly string[]): void {
  const allowed = new Set(allowedKeys);
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    throw new OvertimeRequestInvalidError();
  }
}

function integer(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new OvertimeRequestInvalidError();
  }
  return value;
}

function positiveInteger(value: unknown, fallback?: number): number {
  if (value === undefined && fallback !== undefined) return fallback;
  const result = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : integer(value);
  if (result < 1) throw new OvertimeRequestInvalidError();
  return result;
}

function nullableInteger(value: unknown): number | null {
  return value === null || value === undefined ? null : integer(value);
}

function optionalText(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new OvertimeRequestInvalidError();
  const result = value.normalize('NFKC').trim();
  if (!result || result.length > 500) throw new OvertimeRequestInvalidError();
  return result;
}

function requiredText(value: unknown): string {
  const result = optionalText(value);
  if (!result) throw new OvertimeRequestInvalidError();
  return result;
}

function dateOnly(value: unknown): Date {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new OvertimeRequestInvalidError();
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new OvertimeRequestInvalidError();
  }
  return date;
}

function uuid(value: unknown): string {
  if (typeof value !== 'string') throw new OvertimeRequestInvalidError();
  const result = value.normalize('NFKC').trim().toLocaleLowerCase('en-US');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(result)) {
    throw new OvertimeRequestInvalidError();
  }
  return result;
}

function createCommand(artistId: unknown, body: unknown): SubmitOvertimeCommand {
  const input = record(body);
  exactKeys(input, [
    'breakEndMinute',
    'breakStartMinute',
    'overtimeDate',
    'reason',
    'workEndMinute',
    'workStartMinute',
  ]);
  return {
    artistId: uuid(artistId),
    breakEndMinute: nullableInteger(input.breakEndMinute),
    breakStartMinute: nullableInteger(input.breakStartMinute),
    overtimeDate: dateOnly(input.overtimeDate),
    reason: requiredText(input.reason),
    workEndMinute: integer(input.workEndMinute),
    workStartMinute: integer(input.workStartMinute),
  };
}

export function parseSubmitOvertimeRequest(
  artistId: unknown,
  body: unknown,
): SubmitOvertimeCommand {
  return createCommand(artistId, body);
}

export function parseDirectApproveOvertimeRequest(
  artistId: unknown,
  body: unknown,
): DirectApproveOvertimeCommand {
  return createCommand(artistId, body);
}

export function parseWithdrawOvertimeRequest(
  overtimeId: unknown,
  body: unknown,
): WithdrawOvertimeCommand {
  const input = record(body);
  exactKeys(input, ['expectedRowVersion']);
  return {
    expectedRowVersion: positiveInteger(input.expectedRowVersion),
    overtimeId: uuid(overtimeId),
  };
}

export function parseReviewOvertimeRequest(
  overtimeId: unknown,
  body: unknown,
): ReviewOvertimeCommand {
  const input = record(body);
  exactKeys(input, ['comment', 'decision', 'expectedRowVersion']);
  if (input.decision !== 'APPROVE' && input.decision !== 'REJECT') {
    throw new OvertimeRequestInvalidError();
  }
  const comment = optionalText(input.comment);
  return {
    ...(comment ? { comment } : {}),
    decision: input.decision,
    expectedRowVersion: positiveInteger(input.expectedRowVersion),
    overtimeId: uuid(overtimeId),
  };
}

const STATUSES: readonly OvertimeSummary['status'][] = [
  'APPROVED',
  'PENDING',
  'REJECTED',
  'WITHDRAWN',
];

export function parseOvertimeListRequest(query: unknown): OvertimePageInput {
  const input = record(query);
  exactKeys(input, ['page', 'pageSize', 'status']);
  if (input.status !== undefined && !STATUSES.includes(input.status as OvertimeSummary['status'])) {
    throw new OvertimeRequestInvalidError();
  }
  const pageSize = positiveInteger(input.pageSize, 50);
  if (pageSize > 100) throw new OvertimeRequestInvalidError();
  return {
    page: positiveInteger(input.page, 1),
    pageSize,
    ...(input.status ? { status: input.status as OvertimeSummary['status'] } : {}),
  };
}
