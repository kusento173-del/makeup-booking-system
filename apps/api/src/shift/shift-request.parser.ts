import type { SetInitialShiftCommand } from './shift.types';

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

function nullableInteger(value: unknown): number | null {
  return value === null || value === undefined ? null : integer(value);
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
  if (!Array.isArray(input.workdays)) {
    throw new ShiftRequestInvalidError();
  }

  return {
    artistId: parseArtistId(artistId),
    breakEndMinute: nullableInteger(input.breakEndMinute),
    breakStartMinute: nullableInteger(input.breakStartMinute),
    workEndMinute: integer(input.workEndMinute),
    workStartMinute: integer(input.workStartMinute),
    workdays: input.workdays.map(integer),
  };
}

export function assertNoShiftQuery(query: unknown): void {
  const input = record(query);
  exactKeys(input, []);
}
