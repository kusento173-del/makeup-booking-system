import Taro from '@tarojs/taro';

import { apiRequest } from './api-client';

export type RoleCode = 'HOST' | 'OPERATOR' | 'ARTIST' | 'CUSTOMER_SERVICE' | 'ADMIN';
export type BindableRoleCode = 'HOST' | 'OPERATOR' | 'ARTIST';

export interface LoginRole {
  readonly roleAssignmentId: string;
  readonly roleCode: RoleCode;
  readonly siteId: string | null;
}

export interface SessionTokenPair {
  readonly accessToken: string;
  readonly accessTokenExpiresAt: string;
  readonly refreshToken: string;
  readonly refreshTokenExpiresAt: string;
  readonly role: LoginRole;
  readonly sessionId: string;
  readonly userId: string;
}

export type AuthFlowResult =
  | {
      readonly bindingChallenge: string;
      readonly bindingChallengeExpiresAt: string;
      readonly kind: 'BINDING_REQUIRED';
    }
  | {
      readonly expiresAt: string;
      readonly kind: 'ROLE_SELECTION_REQUIRED';
      readonly roles: readonly LoginRole[];
      readonly roleSelectionChallenge: string;
    }
  | { readonly kind: 'SESSION_CREATED'; readonly session: SessionTokenPair };

export type AccountBindingTarget =
  | { readonly hostCode: string; readonly roleCode: 'HOST' }
  | { readonly nickname: string; readonly roleCode: 'ARTIST' }
  | {
      readonly realName: string;
      readonly roleCode: 'OPERATOR';
      readonly siteCode: string;
    };

const SESSION_STORAGE_KEY = 'makeup-booking-session-v1';

export function saveSession(session: SessionTokenPair): void {
  Taro.setStorageSync(SESSION_STORAGE_KEY, session);
}

export function clearSession(): void {
  Taro.removeStorageSync(SESSION_STORAGE_KEY);
}

export function loadSession(): SessionTokenPair | null {
  const value = Taro.getStorageSync<SessionTokenPair | undefined>(SESSION_STORAGE_KEY);
  if (
    !value ||
    typeof value.accessToken !== 'string' ||
    typeof value.refreshToken !== 'string' ||
    typeof value.accessTokenExpiresAt !== 'string'
  ) {
    return null;
  }
  return value;
}

export async function loginWithWechat(): Promise<AuthFlowResult> {
  const { code } = await Taro.login();
  if (!code) throw new Error('微信登录凭证获取失败');
  return apiRequest('/auth/wechat/login', { body: { code }, method: 'POST' });
}

export function bindWechatAccount(input: {
  readonly bindingChallenge: string;
  readonly bindingCode: string;
  readonly target: AccountBindingTarget;
}): Promise<AuthFlowResult> {
  return apiRequest('/auth/wechat/bind', { body: input, method: 'POST' });
}

export function selectLoginRole(input: {
  readonly roleAssignmentId: string;
  readonly roleSelectionChallenge: string;
}): Promise<AuthFlowResult> {
  return apiRequest('/auth/role-selection', { body: input, method: 'POST' });
}

export async function restoreSession(): Promise<SessionTokenPair | null> {
  const session = loadSession();
  if (!session) return null;
  if (new Date(session.refreshTokenExpiresAt).getTime() <= Date.now()) {
    clearSession();
    return null;
  }
  if (new Date(session.accessTokenExpiresAt).getTime() > Date.now() + 60_000) return session;
  try {
    const refreshed = await apiRequest<SessionTokenPair>('/auth/refresh', {
      body: { refreshToken: session.refreshToken },
      method: 'POST',
    });
    saveSession(refreshed);
    return refreshed;
  } catch {
    clearSession();
    return null;
  }
}
