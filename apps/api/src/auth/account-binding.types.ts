import type { BindableRoleCode } from './binding-code.types';
import type { LoginRole } from './wechat-login.types';

export type AccountBindingTarget =
  | { readonly hostCode: string; readonly roleCode: 'HOST' }
  | { readonly nickname: string; readonly roleCode: 'ARTIST' }
  | { readonly realName: string; readonly roleCode: 'OPERATOR'; readonly siteCode: string };

export interface BindWechatAccountCommand {
  readonly bindingChallenge: string;
  readonly bindingCode: string;
  readonly clientType?: string;
  readonly ipAddress?: string;
  readonly requestId?: string;
  readonly target: AccountBindingTarget;
  readonly userAgent?: string;
}

export interface BoundWechatAccount {
  readonly requiresRoleSelection: boolean;
  readonly roles: readonly LoginRole[];
  readonly userId: string;
}

export interface ResolvedBindingTarget {
  readonly displayName: string;
  readonly profileId: string;
  readonly roleCode: BindableRoleCode;
  readonly rowVersion: number;
  readonly siteId: string;
}
