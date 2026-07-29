import { expect, test } from '@playwright/test';

const apiUrl = 'http://127.0.0.1:3000';

test('认证接口拒绝未知字段并返回统一错误结构', async ({ request }) => {
  const response = await request.post(`${apiUrl}/auth/password/login`, {
    data: { loginName: 'missing.admin', password: 'not-the-password', userId: 'forged-user' },
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

test('主数据接口默认拒绝未登录请求', async ({ request }) => {
  const [readResponse, writeResponse] = await Promise.all([
    request.get(`${apiUrl}/master-data/sites`),
    request.post(`${apiUrl}/master-data/hosts`, { data: {} }),
  ]);

  expect(readResponse.status()).toBe(401);
  expect(writeResponse.status()).toBe(401);
  await expect(readResponse.json()).resolves.toEqual({
    error: { code: 'AUTH_SESSION_INVALID', message: '登录状态无效或账号不可用' },
    statusCode: 401,
  });
});

test('OpenAPI 契约包含认证、主数据路径和分页查询参数', async ({ request }) => {
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
      '/auth/password/login',
      '/auth/password',
      '/auth/password/complete',
      '/auth/role-selection',
      '/auth/refresh',
      '/auth/me',
      '/auth/logout',
      '/auth/logout-all',
      '/backoffice/profile-accounts',
      '/backoffice/profile-accounts/password-reset',
      '/backoffice/accounts',
      '/backoffice/accounts/{id}',
      '/backoffice/accounts/{id}/roles',
      '/backoffice/roles/{id}/revoke',
      '/master-data/sites',
      '/master-data/hosts',
      '/master-data/artists',
      '/master-data/operators',
      '/master-data/host-operator-relations',
      '/master-data/sites/{id}',
      '/master-data/hosts/{id}',
      '/master-data/artists/{id}',
      '/master-data/operators/{id}',
      '/master-data/host-operator-relations/{id}/end',
    ]),
  );
  expect(document.components?.securitySchemes).toHaveProperty('access-token');
  expect(document.paths?.['/backoffice/profile-accounts']).toHaveProperty('post');
  expect(document.paths?.['/backoffice/accounts']).toHaveProperty('get');
  expect(document.paths?.['/backoffice/accounts']).toHaveProperty('post');
  expect(document.paths?.['/backoffice/accounts/{id}']).toHaveProperty('patch');
  expect(document.paths?.['/backoffice/accounts/{id}/roles']).toHaveProperty('post');
  expect(document.paths?.['/backoffice/roles/{id}/revoke']).toHaveProperty('patch');
  const hostOperation = document.paths?.['/master-data/hosts'] as
    { get?: { parameters?: { name?: string }[] }; post?: unknown } | undefined;
  expect(hostOperation).toHaveProperty('post');
  for (const path of [
    '/master-data/sites/{id}',
    '/master-data/hosts/{id}',
    '/master-data/artists/{id}',
    '/master-data/operators/{id}',
    '/master-data/host-operator-relations/{id}/end',
  ]) {
    expect(document.paths?.[path]).toHaveProperty('patch');
  }
  for (const path of [
    '/master-data/sites',
    '/master-data/artists',
    '/master-data/operators',
    '/master-data/host-operator-relations',
  ]) {
    expect(document.paths?.[path]).toHaveProperty('post');
  }
  expect(document.paths?.['/master-data/host-operator-relations']).toHaveProperty('get');
  expect(hostOperation?.get?.parameters?.map(({ name }) => name)).toEqual([
    'page',
    'pageSize',
    'search',
    'asOf',
    'siteId',
    'personnelStatus',
    'qualificationStatus',
  ]);
});
