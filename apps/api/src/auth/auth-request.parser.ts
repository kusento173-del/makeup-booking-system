import type { BindWechatAccountCommand } from './account-binding.types';
import type { BindableRoleCode } from './binding-code.types';

export class AuthRequestInvalidError extends Error {
  readonly code = 'INVALID_REQUEST';

  constructor() {
    super('The request body is invalid');
    this.name = 'AuthRequestInvalidError';
  }
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new AuthRequestInvalidError();
  }

  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[]): void {
  if (Object.keys(value).some((key) => !allowed.includes(key))) {
    throw new AuthRequestInvalidError();
  }
}

function requiredString(value: Record<string, unknown>, key: string, maxLength: number): string {
  const candidate = value[key];

  if (typeof candidate !== 'string') {
    throw new AuthRequestInvalidError();
  }

  const normalized = candidate.normalize('NFKC').trim();

  if (!normalized || normalized.length > maxLength) {
    throw new AuthRequestInvalidError();
  }

  return normalized;
}

export function parseWechatLoginRequest(body: unknown): string {
  const value = record(body);
  exactKeys(value, ['code']);
  return requiredString(value, 'code', 256);
}

export function parseRefreshRequest(body: unknown): string {
  const value = record(body);
  exactKeys(value, ['refreshToken']);
  return requiredString(value, 'refreshToken', 256);
}

export function parseRoleSelectionRequest(body: unknown): {
  readonly roleAssignmentId: string;
  readonly roleSelectionChallenge: string;
} {
  const value = record(body);
  exactKeys(value, ['roleAssignmentId', 'roleSelectionChallenge']);
  return {
    roleAssignmentId: requiredString(value, 'roleAssignmentId', 64),
    roleSelectionChallenge: requiredString(value, 'roleSelectionChallenge', 256),
  };
}

export function parseAccountBindingRequest(
  body: unknown,
  metadata: Omit<BindWechatAccountCommand, 'bindingChallenge' | 'bindingCode' | 'target'>,
): BindWechatAccountCommand {
  const value = record(body);
  exactKeys(value, ['bindingChallenge', 'bindingCode', 'target']);
  const target = record(value['target']);
  const roleCode = requiredString(target, 'roleCode', 32) as BindableRoleCode;

  if (roleCode === 'HOST') {
    exactKeys(target, ['hostCode', 'roleCode']);
    return {
      bindingChallenge: requiredString(value, 'bindingChallenge', 256),
      bindingCode: requiredString(value, 'bindingCode', 32),
      ...metadata,
      target: { hostCode: requiredString(target, 'hostCode', 32), roleCode },
    };
  }

  if (roleCode === 'ARTIST') {
    exactKeys(target, ['nickname', 'roleCode']);
    return {
      bindingChallenge: requiredString(value, 'bindingChallenge', 256),
      bindingCode: requiredString(value, 'bindingCode', 32),
      ...metadata,
      target: { nickname: requiredString(target, 'nickname', 64), roleCode },
    };
  }

  if (roleCode === 'OPERATOR') {
    exactKeys(target, ['realName', 'roleCode', 'siteCode']);
    return {
      bindingChallenge: requiredString(value, 'bindingChallenge', 256),
      bindingCode: requiredString(value, 'bindingCode', 32),
      ...metadata,
      target: {
        realName: requiredString(target, 'realName', 64),
        roleCode,
        siteCode: requiredString(target, 'siteCode', 32),
      },
    };
  }

  throw new AuthRequestInvalidError();
}
