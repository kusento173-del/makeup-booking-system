import { expect, test } from '@playwright/test';

test('管理后台可访问并显示当前工程状态', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: '妆序管理后台' })).toBeVisible();
  await expect(page.getByText('工程初始化', { exact: true })).toBeVisible();
});

test('API 健康检查返回可用状态', async ({ request }) => {
  const response = await request.get('http://127.0.0.1:3000/health');

  expect(response.ok()).toBe(true);
  await expect(response.json()).resolves.toEqual({ service: 'api', status: 'ok' });
});
