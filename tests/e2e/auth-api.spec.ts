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

test('后台登录对不存在的账号返回统一错误且事务锁可以正常执行', async ({ request }) => {
  const response = await request.post(`${apiUrl}/auth/backoffice/login`, {
    data: { loginName: 'missing.admin', password: 'not-the-password' },
  });

  expect(response.status()).toBe(401);
  await expect(response.json()).resolves.toEqual({
    error: { code: 'BACKOFFICE_LOGIN_DENIED', message: '登录状态无效或账号不可用' },
    statusCode: 401,
  });
});

test('OpenAPI 契约包含完整认证路径和访问令牌方案', async ({ request }) => {
  const response = await request.get(`${apiUrl}/openapi.json`);

  expect(response.ok()).toBe(true);
  const document = (await response.json()) as {
    components?: { securitySchemes?: Record<string, unknown> };
    paths?: Record<string, unknown>;
  };
  expect(Object.keys(document.paths ?? {})).toEqual(
    expect.arrayContaining([
      '/auth/backoffice/login',
      '/auth/backoffice/password',
      '/auth/wechat/login',
      '/auth/wechat/bind',
      '/auth/role-selection',
      '/auth/refresh',
      '/auth/me',
      '/auth/logout',
      '/auth/logout-all',
    ]),
  );
  expect(document.components?.securitySchemes).toHaveProperty('access-token');
});
