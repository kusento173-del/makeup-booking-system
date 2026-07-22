import type { CancelLeaveCommand, CreateLeaveCommand, LeaveDateRange } from './leave.types';

export class LeaveRequestInvalidError extends Error {
  readonly code = 'INVALID_REQUEST';

  constructor() {
    super('The leave request is invalid');
    this.name = 'LeaveRequestInvalidError';
  }
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new LeaveRequestInvalidError();
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, allowedKeys: readonly string[]): void {
  const allowed = new Set(allowedKeys);
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    throw new LeaveRequestInvalidError();
  }
}

function dateOnly(value: unknown): Date {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new LeaveRequestInvalidError();
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new LeaveRequestInvalidError();
  }
  return date;
}

function nonNegativeInteger(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new LeaveRequestInvalidError();
  }
  return value;
}

function positiveInteger(value: unknown): number {
  const result = nonNegativeInteger(value);
  if (result < 1) throw new LeaveRequestInvalidError();
  return result;
}

function optionalText(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new LeaveRequestInvalidError();
  const result = value.normalize('NFKC').trim();
  if (!result || result.length > 500) throw new LeaveRequestInvalidError();
  return result;
}

function uuid(value: unknown): string {
  if (typeof value !== 'string') throw new LeaveRequestInvalidError();
  const result = value.normalize('NFKC').trim().toLocaleLowerCase('en-US');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(result)) {
    throw new LeaveRequestInvalidError();
  }
  return result;
}

function range(input: Record<string, unknown>): LeaveDateRange {
  return {
    endDate: dateOnly(input.endDate),
    startDate: dateOnly(input.startDate),
  };
}

export function parseLeavePreviewRequest(body: unknown): LeaveDateRange {
  const input = record(body);
  exactKeys(input, ['endDate', 'startDate']);
  return range(input);
}

export function parseCreateLeaveRequest(body: unknown): CreateLeaveCommand {
  const input = record(body);
  exactKeys(input, ['confirmedAffectedAppointmentCount', 'endDate', 'reason', 'startDate']);
  const reason = optionalText(input.reason);
  return {
    confirmedAffectedAppointmentCount: nonNegativeInteger(input.confirmedAffectedAppointmentCount),
    ...range(input),
    ...(reason ? { reason } : {}),
  };
}

export function parseCancelLeaveRequest(leaveId: unknown, body: unknown): CancelLeaveCommand {
  const input = record(body);
  exactKeys(input, ['expectedRowVersion', 'reason']);
  const reason = optionalText(input.reason);
  return {
    expectedRowVersion: positiveInteger(input.expectedRowVersion),
    leaveId: uuid(leaveId),
    ...(reason ? { reason } : {}),
  };
}
