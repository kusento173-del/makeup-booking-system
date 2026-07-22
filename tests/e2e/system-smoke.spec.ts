import { expect, test } from '@playwright/test';

test('管理后台可访问并显示真实登录入口', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: '管理后台登录' })).toBeVisible();
  await expect(page.getByLabel('登录名')).toBeVisible();
  await expect(page.getByLabel('密码')).toBeVisible();
});

test('API 健康检查返回可用状态', async ({ request }) => {
  const response = await request.get('http://127.0.0.1:3000/health');

  expect(response.ok()).toBe(true);
  await expect(response.json()).resolves.toEqual({
    database: 'ok',
    redis: 'ok',
    service: 'api',
    status: 'ok',
  });
});

test('已登录管理员可看到结构化主播列表', async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem(
      'makeup.backoffice.session',
      JSON.stringify({
        accessToken: 'test-access-token',
        accessTokenExpiresAt: '2099-01-01T00:00:00.000Z',
        refreshToken: 'test-refresh-token',
        refreshTokenExpiresAt: '2099-02-01T00:00:00.000Z',
        role: { roleAssignmentId: 'role-1', roleCode: 'ADMIN', siteId: null },
        sessionId: 'session-1',
        userId: 'user-1',
      }),
    );
  });
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/me') {
      await route.fulfill({ json: { roleCode: 'ADMIN' } });
      return;
    }
    if (path === '/api/master-data/sites') {
      await route.fulfill({
        json: [
          {
            code: 'SONGJIANG',
            id: 'site-1',
            name: '松江',
            rowVersion: 1,
            status: 'ACTIVE',
            timezone: 'Asia/Shanghai',
          },
        ],
      });
      return;
    }
    await route.fulfill({
      json: {
        items: [
          {
            hostCode: 'ZB0001',
            id: 'host-1',
            nickname: '小雨',
            qualificationStatus: 'ACTIVE',
            realName: '主播一',
            rowVersion: 1,
            siteId: 'site-1',
          },
        ],
        page: 1,
        pageSize: 50,
        total: 1,
      },
    });
  });

  await page.goto('/');

  await expect(page.getByRole('heading', { name: '主播' })).toBeVisible();
  await expect(page.getByText('小雨（主播一）')).toBeVisible();
  await expect(page.getByText('ZB0001')).toBeVisible();
  await expect(page.getByText('松江', { exact: true })).toBeVisible();
});
