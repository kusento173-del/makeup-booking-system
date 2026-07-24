import { beforeEach, describe, expect, it, vi } from 'vitest';

const { apiRequest, login } = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  login: vi.fn(),
}));

vi.mock('@tarojs/taro', () => ({
  default: {
    getStorageSync: vi.fn(),
    login,
    removeStorageSync: vi.fn(),
    setStorageSync: vi.fn(),
  },
}));
vi.mock('./api-client', () => ({ apiRequest }));

const { loginWithWechat } = await import('./auth-session');

describe('miniapp authentication session', () => {
  beforeEach(() => {
    apiRequest.mockReset();
    login.mockReset();
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
});
