import type { VerifiedAuthorizationContext } from './authorization.types';

export const BINDABLE_ROLE_CODES = ['HOST', 'OPERATOR', 'ARTIST'] as const;

export type BindableRoleCode = (typeof BINDABLE_ROLE_CODES)[number];

export interface BindingCodeCommandContext extends VerifiedAuthorizationContext {
  readonly actorName: string;
  readonly clientType?: string;
  readonly ipAddress?: string;
  readonly requestId?: string;
  readonly userAgent?: string;
}

export interface BindingTarget {
  readonly profileId: string;
  readonly roleCode: BindableRoleCode;
}

export type IssueBindingCodeCommand = BindingTarget;

export interface IssuedBindingCode extends BindingTarget {
  readonly bindingCodeId: string;
  readonly code: string;
  readonly expiresAt: Date;
  readonly siteId: string;
}

export interface ConsumeBindingCodeCommand extends BindingTarget {
  readonly code: string;
  readonly consumerUserId: string;
}

export interface ConsumedBindingCode extends BindingTarget {
  readonly bindingCodeId: string;
  readonly siteId: string;
}
