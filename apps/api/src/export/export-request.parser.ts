import { ExportRequestInvalidError } from './export.errors';
import type { CreateExportCommand, ExportListInput, ExportStatus } from './export.types';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ExportRequestInvalidError();
  }
  return value as Record<string, unknown>;
}

export function parseExportJobId(value: unknown): string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new ExportRequestInvalidError();
  }
  return value.toLowerCase();
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[]): void {
  if (Object.keys(value).some((key) => !allowed.includes(key))) {
    throw new ExportRequestInvalidError();
  }
}

function date(value: unknown): Date {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) {
    throw new ExportRequestInvalidError();
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new ExportRequestInvalidError();
  }
  return parsed;
}

function optionalUuid(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new ExportRequestInvalidError();
  }
  return value.toLowerCase();
}

function positiveInteger(value: unknown, fallback: number, maximum: number): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw new ExportRequestInvalidError();
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new ExportRequestInvalidError();
  }
  return parsed;
}

export function parseCreateExportRequest(
  body: unknown,
  idempotencyKey: unknown,
): CreateExportCommand {
  const value = record(body);
  exactKeys(value, ['scheduleDate', 'scope', 'siteId']);
  if (value.scope !== 'SINGLE_SITE' && value.scope !== 'ALL_SITES') {
    throw new ExportRequestInvalidError();
  }
  if (typeof idempotencyKey !== 'string') throw new ExportRequestInvalidError();
  const siteId = optionalUuid(value.siteId);
  return {
    idempotencyKey,
    scheduleDate: date(value.scheduleDate),
    scope: value.scope,
    ...(siteId ? { siteId } : {}),
  };
}

export function parseExportListRequest(query: unknown): ExportListInput {
  const value = record(query);
  exactKeys(value, ['page', 'pageSize', 'status']);
  const statuses: readonly ExportStatus[] = ['FAILED', 'PENDING', 'PROCESSING', 'SUCCEEDED'];
  if (value.status !== undefined && !statuses.includes(value.status as ExportStatus)) {
    throw new ExportRequestInvalidError();
  }
  return {
    page: positiveInteger(value.page, 1, 1_000_000),
    pageSize: positiveInteger(value.pageSize, 50, 100),
    ...(value.status ? { status: value.status as ExportStatus } : {}),
  };
}
