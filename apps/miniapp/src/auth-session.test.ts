import { beforeEach, describe, expect, it, vi } from 'vitest';

const { ApiError, apiRequest, getStorageSync, login, removeStorageSync, setStorageSync } =
  vi.hoisted(() => ({
    ApiError: class extends Error {
      constructor(
        readonly status: number,
        readonly code: string,
        message: string,
      ) {
        super(message);
      }
    },
    apiRequest: vi.fn(),
    getStorageSync: vi.fn(),
    login: vi.fn(),
    removeStorageSync: vi.fn(),
    setStorageSync: vi.fn(),
  }));

vi.mock('@tarojs/taro', () => ({
  default: {
    getStorageSync,
    login,
    removeStorageSync,
    setStorageSync,
  },
}));
vi.mock('./api-client', () => ({ ApiError, apiRequest }));

const { loadSession, loginWithWechat, restoreSession } = await import('./auth-session');

const session = {
  accessToken: 'access-token',
  accessTokenExpiresAt: '2999-01-01T00:00:00.000Z',
  refreshToken: 'refresh-token',
  refreshTokenExpiresAt: '2999-02-01T00:00:00.000Z',
  role: {
    roleAssignmentId: 'role-1',
    roleCode: 'HOST' as const,
    siteId: 'site-1',
  },
  sessionId: 'session-1',
  userId: 'user-1',
};

describe('miniapp authentication session', () => {
  beforeEach(() => {
    apiRequest.mockReset();
    getStorageSync.mockReset();
    login.mockReset();
    removeStorageSync.mockReset();
    setStorageSync.mockReset();
  });

  it('微信登录超时后自动重试一次', async () => {
    login.mockRejectedValueOnce(new Error('timeout')).mockResolvedValueOnce({ code: 'fresh-code' });
    apiRequest.mockResolvedValue({ kind: 'BINDING_REQUIRED' });

    await loginWithWechat();

    expect(login).toHaveBeenCalledTimes(2);
    expect(login).toHaveBeenNthCalledWith(1, { timeout: 10_000 });
    expect(login).toHaveBeenNthCalledWith(2, { timeout: 10_000 });
    expect(apiRequest).toHaveBeenCalledWith('/auth/wechat/login', {
      body: { code: 'fresh-code' },
      method: 'POST',
    });
  });

  it('非超时错误不重试', async () => {
    const error = new Error('login:fail denied');
    login.mockRejectedValue(error);

    await expect(loginWithWechat()).rejects.toBe(error);
    expect(login).toHaveBeenCalledTimes(1);
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it('拒绝缺少必要字段的本地会话', () => {
    getStorageSync.mockReturnValue({ ...session, refreshTokenExpiresAt: undefined });

    expect(loadSession()).toBeNull();
  });

  it('访问令牌仍有效时直接恢复且不调用接口', async () => {
    getStorageSync.mockReturnValue(session);

    await expect(restoreSession()).resolves.toBe(session);
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it('访问令牌即将过期时刷新并保存新会话', async () => {
    const expiring = {
      ...session,
      accessTokenExpiresAt: new Date(Date.now() + 30_000).toISOString(),
    };
    const refreshed = { ...session, accessToken: 'refreshed-access-token' };
    getStorageSync.mockReturnValue(expiring);
    apiRequest.mockResolvedValue(refreshed);

    await expect(restoreSession()).resolves.toBe(refreshed);
    expect(apiRequest).toHaveBeenCalledWith('/auth/refresh', {
      body: { refreshToken: session.refreshToken },
      method: 'POST',
    });
    expect(setStorageSync).toHaveBeenCalledWith('makeup-booking-session-v1', refreshed);
  });

  it('刷新令牌永久无效时清除本地会话', async () => {
    getStorageSync.mockReturnValue({
      ...session,
      accessTokenExpiresAt: '2000-01-01T00:00:00.000Z',
    });
    apiRequest.mockRejectedValue(new ApiError(401, 'AUTH_SESSION_INVALID', 'invalid'));

    await expect(restoreSession()).resolves.toBeNull();
    expect(removeStorageSync).toHaveBeenCalledWith('makeup-booking-session-v1');
  });

  it('临时网络错误时保留刷新令牌供后续重试', async () => {
    getStorageSync.mockReturnValue({
      ...session,
      accessTokenExpiresAt: '2000-01-01T00:00:00.000Z',
    });
    apiRequest.mockRejectedValue(new Error('timeout'));

    await expect(restoreSession()).resolves.toBeNull();
    expect(removeStorageSync).not.toHaveBeenCalled();
  });
});
