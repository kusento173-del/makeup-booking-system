import type { SessionTokenPair } from './auth-session.types';
import type { LoginRole } from './login-role.types';

export type AuthFlowResult =
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
