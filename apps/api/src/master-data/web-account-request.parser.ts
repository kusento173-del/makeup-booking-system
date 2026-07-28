import type {
  ProfileAccountRoleCode,
  ProvisionProfileAccountCommand,
  ResetWebAccountPasswordCommand,
} from './web-account.types';
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

function requiredText(value: Record<string, unknown>, key: string, maximum: number): string {
  const candidate = value[key];
  if (typeof candidate !== 'string') {
    throw new MasterDataRequestInvalidError();
  }
  const normalized = candidate.normalize('NFKC').trim();
  if (!normalized || normalized.length > maximum) {
    throw new MasterDataRequestInvalidError();
  }
  return normalized;
}

function temporaryPassword(value: Record<string, unknown>): string {
  const password = value['temporaryPassword'];
  if (typeof password !== 'string' || password.length < 12 || password.length > 128) {
    throw new MasterDataRequestInvalidError();
  }
  return password;
}

export function parseProvisionProfileAccountRequest(body: unknown): ProvisionProfileAccountCommand {
  const value = record(body);
  exactKeys(value, ['profileId', 'roleCode', 'temporaryPassword']);
  const roleCode = value['roleCode'];
  if (!['ARTIST', 'HOST', 'OPERATOR'].includes(String(roleCode))) {
    throw new MasterDataRequestInvalidError();
  }

  return {
    profileId: parseMasterDataId(value['profileId']),
    roleCode: roleCode as ProfileAccountRoleCode,
    temporaryPassword: temporaryPassword(value),
  };
}

export function parseResetWebAccountPasswordRequest(body: unknown): ResetWebAccountPasswordCommand {
  const value = record(body);
  exactKeys(value, ['profileId', 'reason', 'roleCode', 'temporaryPassword']);
  const roleCode = value['roleCode'];
  if (!['ARTIST', 'HOST', 'OPERATOR'].includes(String(roleCode))) {
    throw new MasterDataRequestInvalidError();
  }
  return {
    profileId: parseMasterDataId(value['profileId']),
    reason: requiredText(value, 'reason', 500),
    roleCode: roleCode as ProfileAccountRoleCode,
    temporaryPassword: temporaryPassword(value),
  };
}
