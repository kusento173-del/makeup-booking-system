import type {
  ArtistUnavailablePeriodRange,
  ArtistUnavailablePeriodTarget,
  CancelArtistUnavailablePeriodCommand,
  CreateArtistUnavailablePeriodCommand,
} from './artist-unavailability.types';

export class ArtistUnavailabilityRequestInvalidError extends Error {
  readonly code = 'INVALID_REQUEST';

  constructor() {
    super('The artist unavailability request is invalid');
    this.name = 'ArtistUnavailabilityRequestInvalidError';
  }
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ArtistUnavailabilityRequestInvalidError();
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, allowedKeys: readonly string[]): void {
  const allowed = new Set(allowedKeys);
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    throw new ArtistUnavailabilityRequestInvalidError();
  }
}

function dateOnly(value: unknown): Date {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ArtistUnavailabilityRequestInvalidError();
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new ArtistUnavailabilityRequestInvalidError();
  }
  return date;
}

function integer(value: unknown, minimum: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum) {
    throw new ArtistUnavailabilityRequestInvalidError();
  }
  return value;
}

function minute(value: unknown, allowEndOfDay: boolean): number {
  const result = integer(value, 0);
  const maximum = allowEndOfDay ? 1440 : 1425;
  if (result > maximum || result % 15 !== 0) {
    throw new ArtistUnavailabilityRequestInvalidError();
  }
  return result;
}

function optionalText(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new ArtistUnavailabilityRequestInvalidError();
  const result = value.normalize('NFKC').trim();
  if (!result || result.length > 500) throw new ArtistUnavailabilityRequestInvalidError();
  return result;
}

function requiredText(value: unknown): string {
  const result = optionalText(value);
  if (!result) throw new ArtistUnavailabilityRequestInvalidError();
  return result;
}

function optionalUuid(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  return uuid(value);
}

function uuid(value: unknown): string {
  if (typeof value !== 'string') throw new ArtistUnavailabilityRequestInvalidError();
  const result = value.normalize('NFKC').trim().toLocaleLowerCase('en-US');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(result)) {
    throw new ArtistUnavailabilityRequestInvalidError();
  }
  return result;
}

function range(input: Record<string, unknown>): ArtistUnavailablePeriodRange {
  const startMinute = minute(input.startMinute, false);
  const endMinute = minute(input.endMinute, true);
  if (endMinute <= startMinute) throw new ArtistUnavailabilityRequestInvalidError();
  const artistId = optionalUuid(input.artistId);
  return {
    ...(artistId ? { artistId } : {}),
    endMinute,
    startMinute,
    unavailableDate: dateOnly(input.unavailableDate),
  };
}

export function parseArtistUnavailablePeriodPreviewRequest(
  body: unknown,
): ArtistUnavailablePeriodRange {
  const input = record(body);
  exactKeys(input, ['artistId', 'endMinute', 'startMinute', 'unavailableDate']);
  return range(input);
}

export function parseCreateArtistUnavailablePeriodRequest(
  body: unknown,
): CreateArtistUnavailablePeriodCommand {
  const input = record(body);
  exactKeys(input, [
    'artistId',
    'confirmedAffectedAppointmentCount',
    'endMinute',
    'reason',
    'startMinute',
    'unavailableDate',
  ]);
  return {
    ...range(input),
    confirmedAffectedAppointmentCount: integer(input.confirmedAffectedAppointmentCount, 0),
    reason: requiredText(input.reason),
  };
}

export function parseCancelArtistUnavailablePeriodRequest(
  periodId: unknown,
  body: unknown,
): CancelArtistUnavailablePeriodCommand {
  const input = record(body);
  exactKeys(input, ['expectedRowVersion', 'reason']);
  const reason = optionalText(input.reason);
  return {
    expectedRowVersion: integer(input.expectedRowVersion, 1),
    periodId: uuid(periodId),
    ...(reason ? { reason } : {}),
  };
}

export function parseArtistUnavailablePeriodTarget(query: unknown): ArtistUnavailablePeriodTarget {
  const input = record(query);
  exactKeys(input, ['artistId']);
  const artistId = optionalUuid(input.artistId);
  return artistId ? { artistId } : {};
}
