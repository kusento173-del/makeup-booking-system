import type { AuditQueryInput } from './audit-query.types';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FILTER_PATTERN = /^[A-Z][A-Z0-9_]{0,63}$/;

export class AuditQueryInvalidError extends Error {
  readonly code = 'AUDIT_QUERY_INVALID';
}

function positiveInteger(value: unknown, fallback: number, maximum: number): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) throw new AuditQueryInvalidError();
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new AuditQueryInvalidError();
  }
  return parsed;
}

function optionalFilter(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !FILTER_PATTERN.test(value)) {
    throw new AuditQueryInvalidError();
  }
  return value;
}

export function parseAuditQuery(query: unknown): AuditQueryInput {
  if (!query || typeof query !== 'object' || Array.isArray(query)) {
    throw new AuditQueryInvalidError();
  }
  const value = query as Record<string, unknown>;
  const allowed = ['action', 'objectType', 'page', 'pageSize', 'siteId'];
  if (Object.keys(value).some((key) => !allowed.includes(key))) {
    throw new AuditQueryInvalidError();
  }
  if (
    value.siteId !== undefined &&
    (typeof value.siteId !== 'string' || !UUID_PATTERN.test(value.siteId))
  ) {
    throw new AuditQueryInvalidError();
  }
  const action = optionalFilter(value.action);
  const objectType = optionalFilter(value.objectType);
  return {
    page: positiveInteger(value.page, 1, 1_000_000),
    pageSize: positiveInteger(value.pageSize, 50, 100),
    ...(action ? { action } : {}),
    ...(objectType ? { objectType } : {}),
    ...(typeof value.siteId === 'string' ? { siteId: value.siteId.toLowerCase() } : {}),
  };
}
