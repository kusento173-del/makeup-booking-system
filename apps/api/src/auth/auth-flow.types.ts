import type { SessionTokenPair } from './auth-session.types';
import type { LoginRole, WechatAccountRequiresBinding } from './wechat-login.types';

export type AuthFlowResult =
  | WechatAccountRequiresBinding
  | {
      readonly expiresAt: Date;
      readonly kind: 'PASSWORD_CHANGE_REQUIRED';
      readonly passwordChangeChallenge: string;
    }
  | { readonly kind: 'SESSION_CREATED'; readonly session: SessionTokenPair }
  | {
      readonly expiresAt: Date;
      readonly kind: 'ROLE_SELECTION_REQUIRED';
      readonly roles: readonly LoginRole[];
      readonly roleSelectionChallenge: string;
    };
