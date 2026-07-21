import { Injectable } from '@nestjs/common';

import type { RoleCode, VerifiedAuthorizationContext } from './authorization.types';

export class AuthorizationDeniedError extends Error {
  readonly code = 'AUTHORIZATION_DENIED';

  constructor() {
    super('The current identity is not authorized for this operation');
    this.name = 'AuthorizationDeniedError';
  }
}

@Injectable()
export class AuthorizationPolicyService {
  assertRole(context: VerifiedAuthorizationContext, allowedRoles: readonly RoleCode[]): void {
    if (!allowedRoles.includes(context.roleCode)) {
      throw new AuthorizationDeniedError();
    }
  }

  assertSelfScope(context: VerifiedAuthorizationContext, targetUserId: string): void {
    if (context.userId !== targetUserId) {
      throw new AuthorizationDeniedError();
    }
  }

  assertSiteScope(context: VerifiedAuthorizationContext, targetSiteId: string): void {
    if (context.roleCode === 'ADMIN') {
      return;
    }

    if (context.roleCode === 'CUSTOMER_SERVICE' && context.siteId === targetSiteId) {
      return;
    }

    throw new AuthorizationDeniedError();
  }
}
