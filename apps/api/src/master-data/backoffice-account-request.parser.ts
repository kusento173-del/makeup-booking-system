import { normalizeBackofficeLoginName } from '../auth/backoffice-login-name';
import type {
  AssignBackofficeRoleCommand,
  BackofficeRoleCode,
  CreateBackofficeAccountCommand,
  RevokeBackofficeRoleCommand,
  UpdateBackofficeAccountCommand,
} from './backoffice-account.types';
import { MasterDataRequestInvalidError, parseMasterDataId } from './master-data-request.parser';

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new MasterDataRequestInvalidError();
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): void {
  if (Object.keys(value).some((key) => !keys.includes(key))) {
    throw new MasterDataRequestInvalidError();
  }
}

function text(value: Record<string, unknown>, field: string, maximum: number): string {
  const raw = value[field];
  if (typeof raw !== 'string') {
    throw new MasterDataRequestInvalidError();
  }
  const normalized = raw.normalize('NFKC').trim();
  if (!normalized || normalized.length > maximum) {
    throw new MasterDataRequestInvalidError();
  }
  return normalized;
}

function rowVersion(value: Record<string, unknown>): number {
  const result = value['expectedRowVersion'];
  if (typeof result !== 'number' || !Number.isSafeInteger(result) || result < 1) {
    throw new MasterDataRequestInvalidError();
  }
  return result;
}

function role(value: Record<string, unknown>): BackofficeRoleCode {
  if (value['roleCode'] !== 'ADMIN' && value['roleCode'] !== 'CUSTOMER_SERVICE') {
    throw new MasterDataRequestInvalidError();
  }
  return value['roleCode'];
}

function optionalSiteId(value: Record<string, unknown>, roleCode: BackofficeRoleCode) {
  const siteId = value['siteId'];
  if (roleCode === 'ADMIN') {
    if (siteId !== undefined && siteId !== null) {
      throw new MasterDataRequestInvalidError();
    }
    return undefined;
  }
  return parseMasterDataId(siteId);
}

export function parseCreateBackofficeAccountRequest(body: unknown): CreateBackofficeAccountCommand {
  const value = record(body);
  exactKeys(value, ['displayName', 'loginName', 'password', 'roleCode', 'siteId']);
  const roleCode = role(value);
  const loginName = normalizeBackofficeLoginName(text(value, 'loginName', 64));
  const password = value['password'];
  if (!loginName || typeof password !== 'string' || password.length < 12 || password.length > 128) {
    throw new MasterDataRequestInvalidError();
  }
  const siteId = optionalSiteId(value, roleCode);

  return {
    displayName: text(value, 'displayName', 64),
    loginName,
    password,
    roleCode,
    ...(siteId ? { siteId } : {}),
  };
}

export function parseUpdateBackofficeAccountRequest(
  id: unknown,
  body: unknown,
): UpdateBackofficeAccountCommand {
  const value = record(body);
  exactKeys(value, ['displayName', 'expectedRowVersion', 'reason', 'status']);
  if (value['status'] !== 'ACTIVE' && value['status'] !== 'DISABLED') {
    throw new MasterDataRequestInvalidError();
  }
  return {
    displayName: text(value, 'displayName', 64),
    expectedRowVersion: rowVersion(value),
    id: parseMasterDataId(id),
    reason: text(value, 'reason', 500),
    status: value['status'],
  };
}

export function parseAssignBackofficeRoleRequest(
  userId: unknown,
  body: unknown,
): AssignBackofficeRoleCommand {
  const value = record(body);
  exactKeys(value, ['roleCode', 'siteId']);
  const roleCode = role(value);
  const siteId = optionalSiteId(value, roleCode);
  return { roleCode, ...(siteId ? { siteId } : {}), userId: parseMasterDataId(userId) };
}

export function parseRevokeBackofficeRoleRequest(
  id: unknown,
  body: unknown,
): RevokeBackofficeRoleCommand {
  const value = record(body);
  exactKeys(value, ['expectedRowVersion', 'reason']);
  return {
    expectedRowVersion: rowVersion(value),
    id: parseMasterDataId(id),
    reason: text(value, 'reason', 500),
  };
}
