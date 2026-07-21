import { describe, expect, it } from 'vitest';

import {
  AuthorizationDeniedError,
  AuthorizationPolicyService,
} from './authorization-policy.service';
import type { VerifiedAuthorizationContext } from './authorization.types';

const policy = new AuthorizationPolicyService();
const baseContext: VerifiedAuthorizationContext = {
  roleAssignmentId: 'role-1',
  roleCode: 'CUSTOMER_SERVICE',
  siteId: 'site-songjiang',
  userId: 'user-1',
};

describe('AuthorizationPolicyService', () => {
  it('allows customer service access only inside the assigned site', () => {
    expect(() => policy.assertSiteScope(baseContext, 'site-songjiang')).not.toThrow();
    expect(() => policy.assertSiteScope(baseContext, 'site-wuxi')).toThrow(
      AuthorizationDeniedError,
    );
  });

  it('allows administrators to access every site scope', () => {
    const context = { ...baseContext, roleCode: 'ADMIN', siteId: null } as const;

    expect(() => policy.assertSiteScope(context, 'site-wuxi')).not.toThrow();
  });

  it('denies site access to roles without an explicit site grant', () => {
    const context = { ...baseContext, roleCode: 'OPERATOR', siteId: null } as const;

    expect(() => policy.assertSiteScope(context, 'site-songjiang')).toThrow(
      AuthorizationDeniedError,
    );
  });

  it('allows self scope only for the bound user', () => {
    expect(() => policy.assertSelfScope(baseContext, 'user-1')).not.toThrow();
    expect(() => policy.assertSelfScope(baseContext, 'user-2')).toThrow(AuthorizationDeniedError);
  });

  it('denies roles unless they are explicitly allowed', () => {
    expect(() => policy.assertRole(baseContext, ['CUSTOMER_SERVICE', 'ADMIN'])).not.toThrow();
    expect(() => policy.assertRole(baseContext, ['ADMIN'])).toThrow(AuthorizationDeniedError);
  });
});
