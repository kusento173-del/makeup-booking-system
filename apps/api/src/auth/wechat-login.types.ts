import type { RoleCode } from './authorization.types';

export interface LoginRole {
  readonly roleAssignmentId: string;
  readonly roleCode: RoleCode;
  readonly siteId: string | null;
}

export interface RecognizedWechatAccount {
  readonly kind: 'ACCOUNT_RECOGNIZED';
  readonly requiresRoleSelection: boolean;
  readonly roles: readonly LoginRole[];
  readonly userId: string;
}

export interface WechatAccountRequiresBinding {
  readonly bindingChallenge: string;
  readonly bindingChallengeExpiresAt: Date;
  readonly kind: 'BINDING_REQUIRED';
}

export type WechatLoginResult = RecognizedWechatAccount | WechatAccountRequiresBinding;
