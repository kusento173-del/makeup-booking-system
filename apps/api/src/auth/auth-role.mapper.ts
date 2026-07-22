import { ROLE_CODES, type RoleCode } from './authorization.types';
import { AccountLoginDeniedError } from './wechat-login.errors';
import type { LoginRole } from './wechat-login.types';

export function isRoleCode(value: string): value is RoleCode {
  return ROLE_CODES.some((roleCode) => roleCode === value);
}

export function toLoginRoles(
  roles: readonly {
    readonly id: string;
    readonly roleCode: string;
    readonly siteId: string | null;
  }[],
): LoginRole[] {
  return roles.map((role) => {
    if (!isRoleCode(role.roleCode)) {
      throw new AccountLoginDeniedError();
    }

    return {
      roleAssignmentId: role.id,
      roleCode: role.roleCode,
      siteId: role.siteId,
    };
  });
}
