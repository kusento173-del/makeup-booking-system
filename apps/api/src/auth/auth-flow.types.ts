import type { SessionTokenPair } from './auth-session.types';
import type { LoginRole, WechatAccountRequiresBinding } from './wechat-login.types';

export type AuthFlowResult =
  | WechatAccountRequiresBinding
  | { readonly kind: 'SESSION_CREATED'; readonly session: SessionTokenPair }
  | {
      readonly expiresAt: Date;
      readonly kind: 'ROLE_SELECTION_REQUIRED';
      readonly roles: readonly LoginRole[];
      readonly roleSelectionChallenge: string;
    };
