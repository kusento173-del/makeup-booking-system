import type { MasterDataPageInput } from './master-data-query.types';

const BUSINESS_TIME_ZONE = 'Asia/Shanghai';

export class MasterDataRequestInvalidError extends Error {
  readonly code = 'INVALID_REQUEST';

  constructor() {
    super('The master-data request is invalid');
    this.name = 'MasterDataRequestInvalidError';
  }
}

export interface MasterDataListRequest {
  readonly asOf: Date;
  readonly page: MasterDataPageInput;
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new MasterDataRequestInvalidError();
  }

  return value as Record<string, unknown>;
}

function positiveInteger(value: unknown, fallback: number, maximum: number): number {
  if (value === undefined) {
    return fallback;
  }

  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) {
    throw new MasterDataRequestInvalidError();
  }

  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed > maximum) {
    throw new MasterDataRequestInvalidError();
  }

  return parsed;
}

function searchText(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw new MasterDataRequestInvalidError();
  }

  const normalized = value.normalize('NFKC').trim();

  if (!normalized || normalized.length > 64) {
    throw new MasterDataRequestInvalidError();
  }

  return normalized;
}

function businessDate(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: '2-digit',
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values['year']}-${values['month']}-${values['day']}`;
}

function dateOnly(value: unknown, now: Date): Date {
  const text = value === undefined ? businessDate(now) : value;

  if (typeof text !== 'string') {
    throw new MasterDataRequestInvalidError();
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);

  if (!match) {
    throw new MasterDataRequestInvalidError();
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const result = new Date(Date.UTC(year, month - 1, day));

  if (
    result.getUTCFullYear() !== year ||
    result.getUTCMonth() !== month - 1 ||
    result.getUTCDate() !== day
  ) {
    throw new MasterDataRequestInvalidError();
  }

  return result;
}

export function parseMasterDataListRequest(
  query: unknown,
  options: { readonly includeAsOf: boolean; readonly now?: Date } = { includeAsOf: false },
): MasterDataListRequest {
  const value = record(query);
  const allowedKeys = options.includeAsOf
    ? new Set(['asOf', 'page', 'pageSize', 'search'])
    : new Set(['page', 'pageSize', 'search']);

  if (Object.keys(value).some((key) => !allowedKeys.has(key))) {
    throw new MasterDataRequestInvalidError();
  }

  const search = searchText(value['search']);
  return {
    asOf: dateOnly(options.includeAsOf ? value['asOf'] : undefined, options.now ?? new Date()),
    page: {
      page: positiveInteger(value['page'], 1, 100_000),
      pageSize: positiveInteger(value['pageSize'], 50, 100),
      ...(search ? { search } : {}),
    },
  };
}

export function assertNoMasterDataQuery(query: unknown): void {
  if (Object.keys(record(query)).length > 0) {
    throw new MasterDataRequestInvalidError();
  }
}
