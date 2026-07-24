import { beforeEach, describe, expect, it, vi } from 'vitest';

const { request } = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock('@tarojs/taro', () => ({ default: { request } }));
vi.stubGlobal('__API_BASE_URL__', 'http://127.0.0.1:3000/');

const { apiRequest } = await import('./api-client');

describe('miniapp API client', () => {
  beforeEach(() => {
    request.mockReset();
    request.mockResolvedValue({ data: undefined, statusCode: 204 });
  });

  it('没有请求体的 POST 发送合法空 JSON', async () => {
    await apiRequest('/auth/logout', { method: 'POST', token: 'access-token' });

    expect(request).toHaveBeenCalledWith({
      data: {},
      header: {
        Authorization: 'Bearer access-token',
        'Content-Type': 'application/json',
      },
      method: 'POST',
      url: 'http://127.0.0.1:3000/auth/logout',
    });
  });

  it('有请求体时发送 JSON 数据及内容类型', async () => {
    await apiRequest('/auth/wechat/login', {
      body: { code: 'wechat-code' },
      method: 'POST',
    });

    expect(request).toHaveBeenCalledWith({
      data: { code: 'wechat-code' },
      header: { 'Content-Type': 'application/json' },
      method: 'POST',
      url: 'http://127.0.0.1:3000/auth/wechat/login',
    });
  });
});
