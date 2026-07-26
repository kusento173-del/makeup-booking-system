import Taro from '@tarojs/taro';

import { ApiError, apiRequest } from './api-client';

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
const WECHAT_LOGIN_TIMEOUT_MS = 10_000;

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
    typeof value.accessTokenExpiresAt !== 'string' ||
    typeof value.refreshTokenExpiresAt !== 'string' ||
    typeof value.sessionId !== 'string' ||
    typeof value.userId !== 'string' ||
    typeof value.role?.roleAssignmentId !== 'string' ||
    !['ADMIN', 'ARTIST', 'CUSTOMER_SERVICE', 'HOST', 'OPERATOR'].includes(value.role.roleCode)
  ) {
    return null;
  }
  return value;
}

export async function loginWithWechat(): Promise<AuthFlowResult> {
  let lastTimeout: unknown;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const { code } = await Taro.login({ timeout: WECHAT_LOGIN_TIMEOUT_MS });
      if (!code) throw new Error('微信登录凭证获取失败');
      return apiRequest('/auth/wechat/login', { body: { code }, method: 'POST' });
    } catch (cause) {
      if (!wechatLoginTimedOut(cause)) throw cause;
      lastTimeout = cause;
    }
  }

  throw lastTimeout;
}

function wechatLoginTimedOut(cause: unknown): boolean {
  if (cause instanceof Error) return /timeout/i.test(cause.message);
  if (typeof cause !== 'object' || cause === null || !('errMsg' in cause)) return false;
  return typeof cause.errMsg === 'string' && /timeout/i.test(cause.errMsg);
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

export async function logoutSession(accessToken: string): Promise<void> {
  try {
    await apiRequest<void>('/auth/logout', { method: 'POST', token: accessToken });
  } finally {
    clearSession();
  }
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
  } catch (cause) {
    if (cause instanceof ApiError && [401, 403].includes(cause.status)) clearSession();
    return null;
  }
}
