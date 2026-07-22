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
