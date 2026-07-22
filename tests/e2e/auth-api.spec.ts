import { expect, test } from '@playwright/test';

const apiUrl = 'http://127.0.0.1:3000';

test('认证接口拒绝未知字段并返回统一错误结构', async ({ request }) => {
  const response = await request.post(`${apiUrl}/auth/wechat/login`, {
    data: { code: 'wx-code', userId: 'forged-user' },
  });

  expect(response.status()).toBe(400);
  await expect(response.json()).resolves.toEqual({
    error: { code: 'INVALID_REQUEST', message: '请求内容不正确' },
    statusCode: 400,
  });
});

test('当前身份接口默认拒绝未登录请求', async ({ request }) => {
  const response = await request.get(`${apiUrl}/auth/me`);

  expect(response.status()).toBe(401);
  await expect(response.json()).resolves.toEqual({
    error: { code: 'AUTH_SESSION_INVALID', message: '登录状态无效或账号不可用' },
    statusCode: 401,
  });
});
