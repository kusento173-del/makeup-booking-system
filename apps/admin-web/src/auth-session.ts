import { ApiError, apiRequest } from './api-client';

export type RoleCode = 'ADMIN' | 'ARTIST' | 'CUSTOMER_SERVICE' | 'HOST' | 'OPERATOR';
export type BackofficeRoleCode = Extract<RoleCode, 'ADMIN' | 'CUSTOMER_SERVICE'>;

export interface SessionRole {
  readonly roleAssignmentId: string;
  readonly roleCode: RoleCode;
  readonly siteId: string | null;
}

export interface SessionTokenPair {
  readonly accessToken: string;
  readonly accessTokenExpiresAt: string;
  readonly refreshToken: string;
  readonly refreshTokenExpiresAt: string;
  readonly role: SessionRole;
  readonly sessionId: string;
  readonly userId: string;
}

export interface CurrentProfile {
  readonly account: string;
  readonly displayName: string;
  readonly hostCode: string | null;
  readonly personName: string;
  readonly roleCode: RoleCode;
  readonly siteId: string | null;
  readonly siteName: string | null;
}

export type BackofficeLoginResult =
  | {
      readonly expiresAt: string;
      readonly kind: 'PASSWORD_CHANGE_REQUIRED';
      readonly passwordChangeChallenge: string;
    }
  | { readonly kind: 'SESSION_CREATED'; readonly session: SessionTokenPair }
  | {
      readonly expiresAt: string;
      readonly kind: 'ROLE_SELECTION_REQUIRED';
      readonly roles: readonly SessionRole[];
      readonly roleSelectionChallenge: string;
    };

const SESSION_KEY = 'makeup.backoffice.session';

function isSession(value: unknown): value is SessionTokenPair {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const session = value as Partial<SessionTokenPair>;
  return (
    typeof session.accessToken === 'string' &&
    typeof session.accessTokenExpiresAt === 'string' &&
    typeof session.refreshToken === 'string' &&
    typeof session.refreshTokenExpiresAt === 'string' &&
    typeof session.sessionId === 'string' &&
    typeof session.userId === 'string' &&
    typeof session.role?.roleAssignmentId === 'string' &&
    ['ADMIN', 'ARTIST', 'CUSTOMER_SERVICE', 'HOST', 'OPERATOR'].includes(
      session.role.roleCode ?? '',
    )
  );
}

export function isPermanentSessionError(cause: unknown): boolean {
  return cause instanceof ApiError && [401, 403].includes(cause.status);
}

export function loadSession(
  storage: Pick<Storage, 'getItem'> = sessionStorage,
): SessionTokenPair | null {
  try {
    const value = JSON.parse(storage.getItem(SESSION_KEY) ?? 'null') as unknown;
    return isSession(value) ? value : null;
  } catch {
    return null;
  }
}

export function saveSession(
  session: SessionTokenPair | null,
  storage: Pick<Storage, 'removeItem' | 'setItem'> = sessionStorage,
): void {
  if (session) {
    storage.setItem(SESSION_KEY, JSON.stringify(session));
  } else {
    storage.removeItem(SESSION_KEY);
  }
}

export function login(loginName: string, password: string): Promise<BackofficeLoginResult> {
  return apiRequest('/auth/password/login', {
    body: { loginName, password },
    method: 'POST',
  });
}

export function completeInitialPasswordChange(
  passwordChangeChallenge: string,
  newPassword: string,
): Promise<BackofficeLoginResult> {
  return apiRequest('/auth/password/complete', {
    body: { newPassword, passwordChangeChallenge },
    method: 'POST',
  });
}

export function selectRole(
  roleSelectionChallenge: string,
  roleAssignmentId: string,
): Promise<BackofficeLoginResult> {
  return apiRequest('/auth/role-selection', {
    body: { roleAssignmentId, roleSelectionChallenge },
    method: 'POST',
  });
}

export function refreshSession(refreshToken: string): Promise<SessionTokenPair> {
  return apiRequest('/auth/refresh', { body: { refreshToken }, method: 'POST' });
}

export function verifySession(accessToken: string): Promise<unknown> {
  return apiRequest('/auth/me', { token: accessToken });
}

export function getCurrentProfile(accessToken: string): Promise<CurrentProfile> {
  return apiRequest('/auth/profile', { token: accessToken });
}

export function logoutSession(accessToken: string): Promise<void> {
  return apiRequest('/auth/logout', { method: 'POST', token: accessToken });
}
