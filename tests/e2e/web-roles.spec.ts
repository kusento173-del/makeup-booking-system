import { expect, type Browser, type Page, test } from '@playwright/test';

const password = (() => {
  const value = process.env.WEB_E2E_PASSWORD;
  if (!value) throw new Error('WEB_E2E_PASSWORD is required');
  return value;
})();
const workerToken = (() => {
  const value = process.env.WEB_E2E_WORKER_TOKEN;
  if (!value) throw new Error('WEB_E2E_WORKER_TOKEN is required');
  return value;
})();

const accounts = {
  admin: 'qa-admin',
  artist: 'qa-artist-songjiang',
  customerService: 'qa-cs-songjiang',
  host: 'QA000001',
  operator: 'qa-operator-songjiang',
} as const;

function businessDate(offset = 0): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
  });
  const date = new Date(`${formatter.format(new Date())}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function nextSaturday(): string {
  for (let offset = 1; offset <= 7; offset += 1) {
    const date = new Date(`${businessDate(offset)}T00:00:00.000Z`);
    if (date.getUTCDay() === 6) return businessDate(offset);
  }
  throw new Error('A Saturday should exist in the next seven days');
}

async function login(page: Page, loginName: string): Promise<void> {
  await page.goto('/');
  await page.getByLabel('登录名').fill(loginName);
  await page.getByLabel('密码').fill(password);
  await page.getByRole('button', { name: '登录', exact: true }).click();
}

function acceptNextDialog(page: Page): void {
  page.once('dialog', async (dialog) => dialog.accept());
}

function newBackofficePage(browser: Browser): Promise<Page> {
  return browser.newPage({ viewport: { height: 900, width: 1440 } });
}

test.describe.serial('统一网页五角色完整业务验收', () => {
  test('五角色进入各自工作台且客服和管理员权限隔离', async ({ browser }) => {
    const roles = [
      [accounts.host, '我的化妆安排'],
      [accounts.operator, '主播化妆安排'],
      [accounts.artist, '我的工作安排'],
    ] as const;

    for (const [account, heading] of roles) {
      const page = await browser.newPage();
      await login(page, account);
      await expect(page.getByRole('heading', { name: heading })).toBeVisible();
      await page.close();
    }

    const customerServicePage = await newBackofficePage(browser);
    await login(customerServicePage, accounts.customerService);
    await expect(customerServicePage.getByText('客服', { exact: true })).toBeVisible();
    await expect(customerServicePage.getByRole('button', { name: '账号与角色' })).toHaveCount(0);
    await expect(customerServicePage.getByLabel('场地')).toHaveCount(0);
    await expect(customerServicePage.getByText('全量测试现厂主播')).toHaveCount(0);
    await customerServicePage.close();

    const adminPage = await newBackofficePage(browser);
    await login(adminPage, accounts.admin);
    await expect(adminPage.getByText('管理员', { exact: true })).toBeVisible();
    await expect(adminPage.getByRole('button', { name: '账号与角色' })).toBeVisible();
    await expect(adminPage.getByLabel('场地')).toBeVisible();
    await adminPage.close();
  });

  test('主播创建单次预约，运营提交固定申请，客服审批并生成排班', async ({ browser, request }) => {
    const hostPage = await browser.newPage();
    await login(hostPage, accounts.host);
    await hostPage.getByRole('button', { name: /预约化妆/ }).click();
    await hostPage.getByRole('combobox').selectOption({ label: '全量测试松江化妆师' });
    await expect(hostPage.getByRole('button', { name: '09:00', exact: true })).toBeVisible();
    acceptNextDialog(hostPage);
    await hostPage.getByRole('button', { name: '09:00', exact: true }).click();
    await expect(hostPage.getByRole('heading', { name: '我的排班' })).toBeVisible();
    await hostPage.getByRole('button', { name: '明日', exact: true }).click();
    const singleAppointment = hostPage
      .getByRole('article')
      .filter({ hasText: '单次预约' })
      .filter({ hasText: '09:00' });
    await expect(singleAppointment).toContainText('已预约');
    await hostPage.close();

    const operatorPage = await browser.newPage();
    await login(operatorPage, accounts.operator);
    await operatorPage.getByRole('button', { name: /负责主播 按负责关系/ }).click();
    await expect(operatorPage.getByText('全量测试主播 · QA000001')).toBeVisible();
    await expect(operatorPage.getByText('暂无固定化妆师')).toBeVisible();
    await operatorPage.getByRole('button', { name: '返回' }).click();
    await operatorPage.getByRole('button', { name: /固定申请 新建/ }).click();
    await operatorPage.getByLabel('主播').selectOption({ label: '全量测试主播 · QA000001' });
    await operatorPage.getByLabel('化妆师').selectOption({ label: '全量测试松江化妆师' });
    await operatorPage.getByLabel('申请原因').fill('全量验收固定申请');
    await expect(operatorPage.getByRole('button', { name: /^10:00/ })).toBeVisible();
    await operatorPage.getByRole('button', { name: /^10:00/ }).click();
    await operatorPage.getByRole('button', { name: '提交固定申请' }).click();
    const pendingRequest = operatorPage
      .getByRole('article')
      .filter({ hasText: '全量验收固定申请' });
    await expect(pendingRequest).toContainText('PENDING');
    await operatorPage.close();

    const customerServicePage = await newBackofficePage(browser);
    await login(customerServicePage, accounts.customerService);
    await customerServicePage.getByRole('button', { name: '固定申请审批' }).click();
    await expect(customerServicePage.getByText('全量验收固定申请')).toBeVisible();
    acceptNextDialog(customerServicePage);
    await customerServicePage.getByRole('button', { name: '通过' }).click();
    await expect(customerServicePage.getByText('当前没有待审核的固定申请')).toBeVisible();
    await customerServicePage.close();

    const generation = await request.post('http://127.0.0.1:3100/internal/jobs/fixed-generation', {
      headers: { 'x-worker-token': workerToken },
    });
    expect(generation.ok()).toBe(true);
    await expect(generation.json()).resolves.toMatchObject({ generated: 6 });
  });

  test('化妆师请假取消后只恢复固定预约，并可设置和取消局部不可排', async ({ page }) => {
    await login(page, accounts.artist);
    await page.getByRole('button', { name: /我的排班 今日/ }).click();
    await page.getByRole('button', { name: '明日', exact: true }).click();
    await expect(page.getByRole('article').filter({ hasText: '单次预约' })).toContainText('已预约');
    await expect(page.getByRole('article').filter({ hasText: '固定预约' })).toContainText('已预约');

    await page.getByRole('button', { name: '返回' }).click();
    await page.getByRole('button', { name: /请假 申请/ }).click();
    await page.getByLabel('原因（选填）').fill('全量验收请假');
    acceptNextDialog(page);
    await page.getByRole('button', { name: '提交请假' }).click();
    const leave = page.getByRole('article').filter({ hasText: '全量验收请假' });
    await expect(leave).toContainText('生效中');
    acceptNextDialog(page);
    await leave.getByRole('button', { name: '取消请假' }).click();
    await expect(leave).toHaveCount(0);

    await page.getByRole('button', { name: '返回' }).click();
    await page.getByRole('button', { name: /我的排班 今日/ }).click();
    await page.getByRole('button', { name: '明日', exact: true }).click();
    await expect(page.getByRole('article').filter({ hasText: '单次预约' })).toContainText('已取消');
    await expect(page.getByRole('article').filter({ hasText: '固定预约' })).toContainText('已预约');

    await page.getByRole('button', { name: '返回' }).click();
    await page.getByRole('button', { name: /临时不可排班 设置/ }).click();
    await page.getByLabel('开始').fill('11:00');
    await page.getByLabel('结束').fill('11:30');
    await page.getByLabel('原因').fill('全量验收临时上课');
    acceptNextDialog(page);
    await page.getByRole('button', { name: '确认设置' }).click();
    const unavailable = page.getByRole('article').filter({ hasText: '全量验收临时上课' });
    await expect(unavailable).toContainText('生效中');
    acceptNextDialog(page);
    await unavailable.getByRole('button', { name: '取消设置' }).click();
    await expect(unavailable).toHaveCount(0);
  });

  test('化妆师提交班次和加班申请，所属场地客服审批', async ({ browser }) => {
    const artistPage = await browser.newPage();
    await login(artistPage, accounts.artist);
    await artistPage.getByRole('button', { name: /班次 首次设置/ }).click();
    await expect(artistPage.getByRole('heading', { name: '班次与修改申请' })).toBeVisible();
    await artistPage.getByLabel('下班时间').fill('17:45');
    await artistPage.getByLabel('修改原因').fill('全量验收班次调整');
    await artistPage.getByRole('button', { name: '提交修改申请' }).click();
    await expect(
      artistPage.getByRole('article').filter({ hasText: '全量验收班次调整' }),
    ).toContainText('PENDING');

    await artistPage.getByRole('button', { name: '返回' }).click();
    await artistPage.getByRole('button', { name: /加班 为非工作日/ }).click();
    await artistPage.getByLabel('加班日期').fill(nextSaturday());
    await artistPage.getByLabel('原因').fill('全量验收周末加班');
    await artistPage.getByRole('button', { name: '提交加班申请' }).click();
    await expect(
      artistPage.getByRole('article').filter({ hasText: '全量验收周末加班' }),
    ).toContainText('PENDING');
    await artistPage.close();

    const customerServicePage = await newBackofficePage(browser);
    await login(customerServicePage, accounts.customerService);
    await customerServicePage.getByRole('button', { name: '班次审批' }).click();
    await expect(customerServicePage.getByText('全量验收班次调整')).toBeVisible();
    acceptNextDialog(customerServicePage);
    await customerServicePage.getByRole('button', { name: '通过' }).click();
    await expect(customerServicePage.getByText('当前没有待审核的班次修改')).toBeVisible();

    await customerServicePage.getByRole('button', { name: '加班审批' }).click();
    await expect(customerServicePage.getByText('全量验收周末加班')).toBeVisible();
    acceptNextDialog(customerServicePage);
    await customerServicePage.getByRole('button', { name: '通过' }).click();
    await expect(customerServicePage.getByText('当前没有待审核的加班申请')).toBeVisible();
    await customerServicePage.close();
  });

  test('三端固定关系一致且管理员可追溯业务操作', async ({ browser }) => {
    const hostPage = await browser.newPage();
    await login(hostPage, accounts.host);
    await expect(hostPage.getByText('固定化妆师：全量测试松江化妆师')).toBeVisible();
    await hostPage.close();

    const operatorPage = await browser.newPage();
    await login(operatorPage, accounts.operator);
    await operatorPage.getByRole('button', { name: /负责主播 按负责关系/ }).click();
    await expect(operatorPage.getByText(/固定：全量测试松江化妆师/)).toBeVisible();
    await operatorPage.close();

    const artistPage = await browser.newPage();
    await login(artistPage, accounts.artist);
    await expect(artistPage.getByText('固定主播：全量测试主播（QA000001）')).toBeVisible();
    await artistPage.close();

    const adminPage = await newBackofficePage(browser);
    await login(adminPage, accounts.admin);
    await adminPage.getByRole('button', { name: '操作记录' }).click();
    await expect(adminPage.getByRole('heading', { name: '操作记录' })).toBeVisible();
    await expect(adminPage.getByText('全量验收固定申请')).toBeVisible();
    await adminPage.close();
  });
});
