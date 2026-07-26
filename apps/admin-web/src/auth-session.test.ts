import { describe, expect, it, vi } from 'vitest';

import { ApiError } from './api-client';
import {
  isPermanentSessionError,
  loadSession,
  saveSession,
  type SessionTokenPair,
} from './auth-session';

const session: SessionTokenPair = {
  accessToken: 'access-token',
  accessTokenExpiresAt: '2026-07-22T08:15:00.000Z',
  refreshToken: 'refresh-token',
  refreshTokenExpiresAt: '2026-08-21T08:00:00.000Z',
  role: {
    roleAssignmentId: 'role-1',
    roleCode: 'ADMIN',
    siteId: null,
  },
  sessionId: 'session-1',
  userId: 'user-1',
};

describe('backoffice session storage', () => {
  it('round-trips a valid session through the provided tab storage', () => {
    let stored: string | null = null;
    const storage = {
      getItem: vi.fn(() => stored),
      removeItem: vi.fn(() => {
        stored = null;
      }),
      setItem: vi.fn((_key: string, value: string) => {
        stored = value;
      }),
    };

    saveSession(session, storage);
    expect(loadSession(storage)).toEqual(session);
    saveSession(null, storage);
    expect(loadSession(storage)).toBeNull();
  });

  it('rejects malformed stored values', () => {
    expect(loadSession({ getItem: () => '{bad json' })).toBeNull();
    expect(loadSession({ getItem: () => JSON.stringify({ accessToken: 'partial' }) })).toBeNull();
    expect(
      loadSession({
        getItem: () => JSON.stringify({ ...session, refreshTokenExpiresAt: undefined }),
      }),
    ).toBeNull();
  });

  it('only treats authorization failures as permanent session errors', () => {
    expect(isPermanentSessionError(new ApiError(401, 'AUTH_SESSION_INVALID', 'invalid'))).toBe(
      true,
    );
    expect(isPermanentSessionError(new ApiError(403, 'AUTHORIZATION_DENIED', 'denied'))).toBe(true);
    expect(isPermanentSessionError(new ApiError(500, 'INTERNAL_ERROR', 'failed'))).toBe(false);
    expect(isPermanentSessionError(new TypeError('Failed to fetch'))).toBe(false);
  });
});
