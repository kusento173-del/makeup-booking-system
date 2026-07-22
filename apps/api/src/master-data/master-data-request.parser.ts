import type {
  AssignOperatorCommand,
  CreateArtistCommand,
  CreateHostCommand,
  CreateOperatorCommand,
  CreateSiteCommand,
} from './master-data-command.types';
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

function exactKeys(value: Record<string, unknown>, allowedKeys: readonly string[]): void {
  const allowed = new Set(allowedKeys);

  if (Object.keys(value).some((key) => !allowed.has(key))) {
    throw new MasterDataRequestInvalidError();
  }
}

function requiredText(
  value: Record<string, unknown>,
  field: string,
  maximumLength: number,
): string {
  const raw = value[field];

  if (typeof raw !== 'string') {
    throw new MasterDataRequestInvalidError();
  }

  const normalized = raw.normalize('NFKC').trim();

  if (!normalized || normalized.length > maximumLength) {
    throw new MasterDataRequestInvalidError();
  }

  return normalized;
}

function optionalText(
  value: Record<string, unknown>,
  field: string,
  maximumLength: number,
): string | undefined {
  if (value[field] === undefined || value[field] === null) {
    return undefined;
  }

  return requiredText(value, field, maximumLength);
}

function uuid(value: Record<string, unknown>, field: string): string {
  const id = requiredText(value, field, 36).toLocaleLowerCase('en-US');

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)) {
    throw new MasterDataRequestInvalidError();
  }

  return id;
}

function optionalInteger(value: Record<string, unknown>, field: string, fallback: number): number {
  const raw = value[field];

  if (raw === undefined) {
    return fallback;
  }

  if (
    typeof raw !== 'number' ||
    !Number.isSafeInteger(raw) ||
    raw < -2_147_483_648 ||
    raw > 2_147_483_647
  ) {
    throw new MasterDataRequestInvalidError();
  }

  return raw;
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

export function parseCreateSiteRequest(body: unknown): CreateSiteCommand {
  const value = record(body);
  exactKeys(value, ['code', 'name', 'sortOrder', 'timezone']);
  const timezone = optionalText(value, 'timezone', 64) ?? 'Asia/Shanghai';

  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
  } catch {
    throw new MasterDataRequestInvalidError();
  }

  return {
    code: requiredText(value, 'code', 32),
    name: requiredText(value, 'name', 64),
    sortOrder: optionalInteger(value, 'sortOrder', 0),
    timezone,
  };
}

export function parseCreateHostRequest(body: unknown): CreateHostCommand {
  const value = record(body);
  exactKeys(value, ['hostCode', 'nickname', 'realName', 'siteId']);
  const nickname = optionalText(value, 'nickname', 64);

  return {
    hostCode: requiredText(value, 'hostCode', 32).toLocaleUpperCase('en-US'),
    ...(nickname ? { nickname } : {}),
    realName: requiredText(value, 'realName', 64),
    siteId: uuid(value, 'siteId'),
  };
}

export function parseCreateArtistRequest(body: unknown): CreateArtistCommand {
  const value = record(body);
  exactKeys(value, ['nickname', 'realName', 'siteId']);

  return {
    nickname: requiredText(value, 'nickname', 64),
    realName: requiredText(value, 'realName', 64),
    siteId: uuid(value, 'siteId'),
  };
}

export function parseCreateOperatorRequest(body: unknown): CreateOperatorCommand {
  const value = record(body);
  exactKeys(value, ['realName', 'siteId']);

  return {
    realName: requiredText(value, 'realName', 64),
    siteId: uuid(value, 'siteId'),
  };
}

export function parseAssignOperatorRequest(body: unknown): AssignOperatorCommand {
  const value = record(body);
  exactKeys(value, ['changeReason', 'hostId', 'operatorId', 'validFrom', 'validUntil']);
  const validFrom = dateOnly(requiredText(value, 'validFrom', 10), new Date());
  const validUntilText = optionalText(value, 'validUntil', 10);
  const validUntil = validUntilText ? dateOnly(validUntilText, new Date()) : undefined;
  const changeReason = optionalText(value, 'changeReason', 500);

  if (validUntil && validUntil <= validFrom) {
    throw new MasterDataRequestInvalidError();
  }

  return {
    ...(changeReason ? { changeReason } : {}),
    hostId: uuid(value, 'hostId'),
    operatorId: uuid(value, 'operatorId'),
    validFrom,
    ...(validUntil ? { validUntil } : {}),
  };
}
