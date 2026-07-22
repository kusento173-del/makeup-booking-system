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

test('已登录管理员可查看排班详情并进入主播维护', async ({ page }) => {
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
            sortOrder: 10,
            status: 'ACTIVE',
            timezone: 'Asia/Shanghai',
          },
        ],
      });
      return;
    }
    if (path === '/api/schedule-board') {
      const date = new URL(route.request().url()).searchParams.get('date') ?? '2026-07-22';
      await route.fulfill({
        json: {
          artists: [
            {
              appointments: [
                {
                  appointmentType: 'SINGLE',
                  dailySequence: 1,
                  durationMinutes: 30,
                  endAt: `${date}T02:00:00.000Z`,
                  endMinute: 600,
                  hostCode: 'ZB0001',
                  hostId: 'host-1',
                  hostName: '小雨',
                  id: 'appointment-1',
                  operatorId: 'operator-1',
                  operatorName: '运营甲',
                  rowVersion: 1,
                  startAt: `${date}T01:30:00.000Z`,
                  startMinute: 570,
                  status: 'BOOKED',
                },
              ],
              artistId: 'artist-1',
              artistNickname: '柔柔',
              availabilitySource: 'REGULAR_SHIFT',
              available: true,
              breakInterval: { endMinute: 780, startMinute: 720 },
              unavailableReason: null,
              workIntervals: [
                { endMinute: 720, startMinute: 540 },
                { endMinute: 1080, startMinute: 780 },
              ],
            },
          ],
          date,
          lastUpdatedAt: new Date().toISOString(),
          siteId: 'site-1',
          siteName: '松江',
        },
      });
      return;
    }
    await route.fulfill({
      json: {
        items: [
          {
            hostCode: 'ZB0001',
            id: 'host-1',
            accountBound: false,
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

  await expect(page.getByRole('heading', { name: '排班看板' })).toBeVisible();
  await expect(page.getByRole('article').getByText('柔柔', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /09:30.*小雨/ }).click();
  await expect(page.getByRole('heading', { name: '小雨' })).toBeVisible();
  await expect(page.getByText('实际预约化妆师')).toBeVisible();
  await page.getByRole('button', { name: '关闭' }).click();

  await page.getByRole('button', { name: '主播', exact: true }).click();
  await expect(page.getByRole('heading', { name: '主播' })).toBeVisible();
  await expect(page.getByText('小雨（主播一）')).toBeVisible();
  await expect(page.getByText('ZB0001')).toBeVisible();
  await expect(page.getByText('松江', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '新增' }).click();
  await expect(page.getByRole('heading', { name: '新增主播' })).toBeVisible();
  await expect(page.getByLabel('主播编号')).toBeVisible();
  await expect(page.getByLabel('所属场地')).toBeVisible();
  await page.getByRole('button', { name: '关闭' }).click();
  await page.getByRole('button', { name: '编辑' }).click();
  await expect(page.getByRole('heading', { name: '维护主播' })).toBeVisible();
  await expect(page.getByLabel('修改原因')).toBeVisible();
});
