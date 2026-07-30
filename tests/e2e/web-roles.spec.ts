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
const apiUrl = (() => {
  const value = process.env.WEB_E2E_API_URL;
  if (!value) throw new Error('WEB_E2E_API_URL is required');
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
    await expect(customerServicePage.getByLabel('场地')).toHaveCount(0);
    await expect(customerServicePage.getByText('全量测试现厂主播')).toHaveCount(0);
    await customerServicePage.getByRole('button', { name: '账号与角色' }).click();
    const administratorRow = customerServicePage
      .getByRole('row')
      .filter({ hasText: '全量测试管理员' });
    await expect(administratorRow).toBeVisible();
    await expect(administratorRow.getByRole('button')).toHaveCount(0);
    await customerServicePage.close();

    const adminPage = await newBackofficePage(browser);
    await login(adminPage, accounts.admin);
    await expect(adminPage.getByText('管理员', { exact: true })).toBeVisible();
    await expect(adminPage.getByRole('button', { name: '账号与角色' })).toBeVisible();
    await expect(adminPage.getByLabel('场地')).toBeVisible();
    await adminPage.close();
  });

  test('管理员可以建立主播—运营关系', async ({ browser }) => {
    const adminPage = await newBackofficePage(browser);
    await login(adminPage, accounts.admin);
    await adminPage.getByRole('button', { name: '主播—运营关系' }).click();
    await adminPage.getByRole('button', { name: '新增' }).click();
    await adminPage
      .getByLabel('主播', { exact: true })
      .selectOption({ label: '全量测试现厂主播｜QA000002' });
    await adminPage.getByLabel('运营', { exact: true }).selectOption({ label: '全量测试现厂运营' });
    await adminPage.getByLabel('变更说明（可不填）').fill('验证主播运营关系接口');
    await adminPage.getByRole('button', { name: '建立关系' }).click();
    const relation = adminPage.getByRole('row').filter({ hasText: 'QA000002' });
    await expect(relation).toContainText('全量测试现厂运营');
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
    await expect(pendingRequest).toContainText('待审核');
    await operatorPage.close();

    const customerServicePage = await newBackofficePage(browser);
    await login(customerServicePage, accounts.customerService);
    await customerServicePage.getByRole('button', { name: '固定申请审批' }).click();
    await expect(customerServicePage.getByText('全量验收固定申请')).toBeVisible();
    acceptNextDialog(customerServicePage);
    await customerServicePage.getByRole('button', { name: '通过' }).click();
    await expect(customerServicePage.getByText('当前没有待审核的固定申请')).toBeVisible();
    await customerServicePage.close();

    const generation = await request.post(`${apiUrl}/internal/jobs/fixed-generation`, {
      headers: { 'x-worker-token': workerToken },
    });
    expect(generation.ok()).toBe(true);
    await expect(generation.json()).resolves.toMatchObject({ generated: 6 });
  });

  test('化妆师请假需客服审核并展示受影响预约，取消后只恢复固定预约', async ({ browser }) => {
    const artistPage = await browser.newPage();
    await login(artistPage, accounts.artist);
    await artistPage.getByRole('button', { name: /我的排班 今日/ }).click();
    await artistPage.getByRole('button', { name: '明日', exact: true }).click();
    await expect(artistPage.getByRole('article').filter({ hasText: '单次预约' })).toContainText(
      '已预约',
    );
    await expect(artistPage.getByRole('article').filter({ hasText: '固定预约' })).toContainText(
      '已预约',
    );

    await artistPage.getByRole('button', { name: '返回' }).click();
    await artistPage.getByRole('button', { name: /请假 申请/ }).click();
    await artistPage.getByLabel('原因（选填）').fill('全量验收请假');
    acceptNextDialog(artistPage);
    await artistPage.getByRole('button', { name: '提交请假' }).click();
    const leave = artistPage.getByRole('article').filter({ hasText: '全量验收请假' });
    await expect(leave).toContainText('待审核');

    const customerServicePage = await newBackofficePage(browser);
    await login(customerServicePage, accounts.customerService);
    await customerServicePage.getByRole('button', { name: '请假审批' }).click();
    const leaveApproval = customerServicePage
      .getByRole('article')
      .filter({ hasText: '全量验收请假' });
    await expect(leaveApproval).toContainText('影响 2 条预约');
    await expect(leaveApproval).toContainText('全量测试主播（QA000001）');
    await expect(leaveApproval).toContainText('固定预约');
    await expect(leaveApproval).toContainText('单次预约');
    acceptNextDialog(customerServicePage);
    await leaveApproval.getByRole('button', { name: '通过' }).click();
    await expect(customerServicePage.getByText('当前没有待审核的化妆师请假')).toBeVisible();
    const reviewedLeave = customerServicePage
      .getByRole('article')
      .filter({ hasText: '全量验收请假' });
    await expect(reviewedLeave).toContainText('已通过');
    await expect(reviewedLeave).toContainText('全量测试主播（QA000001）');
    await expect(reviewedLeave).toContainText('固定预约');
    await expect(reviewedLeave).toContainText('单次预约');
    await customerServicePage.close();

    await artistPage.reload();
    await artistPage.getByRole('button', { name: /请假 申请/ }).click();
    const approvedLeave = artistPage.getByRole('article').filter({ hasText: '全量验收请假' });
    await expect(approvedLeave).toContainText('已生效');
    acceptNextDialog(artistPage);
    await approvedLeave.getByRole('button', { name: '取消请假' }).click();
    await expect(approvedLeave).toContainText('已取消');

    await artistPage.getByRole('button', { name: '返回' }).click();
    await artistPage.getByRole('button', { name: /我的排班 今日/ }).click();
    await artistPage.getByRole('button', { name: '明日', exact: true }).click();
    await expect(artistPage.getByRole('article').filter({ hasText: '单次预约' })).toContainText(
      '已取消',
    );
    await expect(artistPage.getByRole('article').filter({ hasText: '固定预约' })).toContainText(
      '已预约',
    );
    await artistPage.close();
  });

  test('化妆师临时不可排班按请假审批，客服通过后才生效', async ({ browser }) => {
    const artistPage = await browser.newPage();
    await login(artistPage, accounts.artist);
    await artistPage.getByRole('button', { name: /临时不可排班 设置/ }).click();
    await artistPage.getByLabel('开始').fill('11:00');
    await artistPage.getByLabel('结束').fill('11:30');
    await artistPage.getByLabel('原因').fill('全量验收临时上课');
    acceptNextDialog(artistPage);
    await artistPage.getByRole('button', { name: '提交审核' }).click();
    const unavailable = artistPage.getByRole('article').filter({ hasText: '全量验收临时上课' });
    await expect(unavailable).toContainText('待审核');

    const customerServicePage = await newBackofficePage(browser);
    await login(customerServicePage, accounts.customerService);
    await customerServicePage.getByRole('button', { name: '请假审批' }).click();
    const approval = customerServicePage
      .getByRole('article')
      .filter({ hasText: '全量验收临时上课' });
    await expect(approval).toContainText('临时不可排班');
    await expect(approval).toContainText('影响 0 条预约');
    acceptNextDialog(customerServicePage);
    await approval.getByRole('button', { name: '通过' }).click();
    await expect(customerServicePage.getByText('当前没有待审核的化妆师请假')).toBeVisible();
    const reviewedPeriod = customerServicePage
      .getByRole('article')
      .filter({ hasText: '全量验收临时上课' });
    await expect(reviewedPeriod).toContainText('已通过');
    await expect(reviewedPeriod).toContainText('当前没有预约受到影响');
    await customerServicePage.close();

    await artistPage.reload();
    await artistPage.getByRole('button', { name: /临时不可排班 设置/ }).click();
    const approved = artistPage.getByRole('article').filter({ hasText: '全量验收临时上课' });
    await expect(approved).toContainText('已生效');
    await approved.getByRole('button', { name: '取消设置' }).click();
    await expect(approved).toContainText('已取消');
    await artistPage.close();
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
    ).toContainText('待审核');

    await artistPage.getByRole('button', { name: '返回' }).click();
    await artistPage.getByRole('button', { name: /加班 为非工作日/ }).click();
    await artistPage.getByLabel('加班日期').fill(nextSaturday());
    await artistPage.getByLabel('原因').fill('全量验收周末加班');
    await artistPage.getByRole('button', { name: '提交加班申请' }).click();
    await expect(
      artistPage.getByRole('article').filter({ hasText: '全量验收周末加班' }),
    ).toContainText('待审核');
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

  test('管理员修正主播编号后同步新的登录名', async ({ browser }) => {
    const adminPage = await newBackofficePage(browser);
    await login(adminPage, accounts.admin);
    await adminPage.getByRole('button', { name: '主播', exact: true }).click();
    await adminPage.getByLabel('搜索').fill('QA000001');
    await adminPage.getByRole('button', { name: '搜索', exact: true }).click();
    const hostRow = adminPage.getByRole('row').filter({ hasText: 'QA000001' });
    await expect(hostRow).toBeVisible();
    await hostRow.getByRole('button', { name: '编辑' }).click();
    await adminPage.getByLabel('主播编号').fill('QA000101');
    await adminPage.getByLabel('修改原因').fill('全量验收修正主播编号');
    await adminPage.getByRole('button', { name: '保存修改' }).click();
    await adminPage.getByLabel('搜索').fill('QA000101');
    await adminPage.getByRole('button', { name: '搜索', exact: true }).click();
    await expect(adminPage.getByRole('row').filter({ hasText: 'QA000101' })).toBeVisible();
    await adminPage.close();

    const hostPage = await browser.newPage();
    await login(hostPage, 'QA000101');
    await expect(hostPage.getByRole('heading', { name: '我的化妆安排' })).toBeVisible();
    await hostPage.close();
  });
});
