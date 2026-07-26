const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const automator = require('miniprogram-automator');

const projectPath = path.resolve(__dirname, '..');
const cliPath =
  process.env.WECHAT_DEVTOOLS_CLI ?? 'C:\\Program Files (x86)\\Tencent\\微信web开发者工具\\cli.bat';
const automationPort = Number(process.env.WECHAT_AUTOMATION_PORT ?? 9420);
const failureMarkers = ['无权访问', '凭证', '请求失败', '服务不可用', '登录状态无效', '加载失败'];
const loadingMarkers = ['正在读取', '正在加载'];
const scenarios = {
  ARTIST: {
    homeMarkers: ['化妆师', '我的工作安排'],
    label: '化妆师',
    pages: [
      ['/pages/schedule/index', ['当前范围共', '未来七日']],
      ['/pages/shift/index', ['当前班次', '工作日', '工作时间']],
      ['/pages/leave/index', ['申请请假', '当前有效请假']],
      ['/pages/overtime/index', ['申请非工作日加班', '我的加班申请']],
      ['/pages/unavailability/index', ['添加临时不可排班时段', '当前有效时段']],
    ],
  },
  HOST: {
    homeMarkers: ['主播', '我的化妆安排'],
    label: '主播',
    pages: [
      ['/pages/schedule/index', ['当前范围共', '未来七日']],
      ['/pages/booking/index', ['选择日期', '选择时长', '选择化妆师']],
      ['/pages/leave/index', ['申请请假', '当前有效请假']],
    ],
  },
  OPERATOR: {
    homeMarkers: ['运营', '主播化妆安排'],
    label: '运营',
    pages: [
      ['/pages/managed-hosts/index', ['负责主播']],
      ['/pages/booking/index', ['选择日期', '选择负责主播']],
      ['/pages/fixed/index', ['固定', '主播']],
    ],
  },
};

function quoteCommandArgument(value) {
  if (/[&|<>^%!"\r\n]/u.test(value)) {
    throw new Error(`命令参数包含不支持的字符：${value}`);
  }

  return `"${value}"`;
}

function enableAutomation() {
  if (!fs.existsSync(cliPath)) {
    throw new Error(`未找到微信开发者工具 CLI：${cliPath}`);
  }

  const command = [
    quoteCommandArgument(cliPath),
    'auto',
    '--project',
    quoteCommandArgument(projectPath),
    '--auto-port',
    String(automationPort),
    '--trust-project',
  ].join(' ');

  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      shell: true,
    });
    let output = '';

    child.stdout.on('data', (chunk) => {
      output += chunk;
    });
    child.stderr.on('data', (chunk) => {
      output += chunk;
    });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`微信开发者工具自动化端口开启失败（退出码 ${code}）：\n${output.trim()}`));
    });
  });
}

async function connectWithRetry() {
  const endpoint = `ws://127.0.0.1:${automationPort}`;
  let lastError;

  for (let attempt = 1; attempt <= 10; attempt += 1) {
    try {
      return await automator.connect({ wsEndpoint: endpoint });
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  throw lastError;
}

async function pageText(page) {
  const views = await page.$$('view');
  return views.length > 0 ? views[0].text() : '';
}

async function waitForContent(page, expected) {
  let text = '';
  for (let attempt = 1; attempt <= 20; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 300));
    text = await pageText(page);
    const finishedLoading = loadingMarkers.every((marker) => !text.includes(marker));
    if (finishedLoading && expected.every((marker) => text.includes(marker))) return text;
  }
  return text;
}

function assertHealthyContent(route, text, expected) {
  const failure = failureMarkers.find((marker) => text.includes(marker));
  if (failure) throw new Error(`${route} 显示失败状态：${failure}\n${text}`);
  const missing = expected.filter((marker) => !text.includes(marker));
  if (missing.length > 0) {
    throw new Error(`${route} 缺少关键内容：${missing.join('、')}\n${text}`);
  }
}

async function assertPageRendered(miniProgram, route, expected) {
  const page = await miniProgram.reLaunch(route);
  const expectedPath = route.split('?')[0].slice(1);
  if (!page || page.path !== expectedPath) {
    throw new Error(`${route} 未进入目标页面`);
  }
  const text = await waitForContent(page, expected);
  assertHealthyContent(route, text, expected);
  process.stdout.write(`✓ ${route}：${expected.join(' / ')}\n`);
}

async function detectScenario(miniProgram) {
  const page = await miniProgram.reLaunch('/pages/index/index');
  const candidates = Object.entries(scenarios);
  let text = '';
  for (let attempt = 1; attempt <= 20; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 300));
    text = await pageText(page);
    const match = candidates.find(([, scenario]) =>
      scenario.homeMarkers.every((marker) => text.includes(marker)),
    );
    if (match) {
      assertHealthyContent('/pages/index/index', text, match[1].homeMarkers);
      return { roleCode: match[0], scenario: match[1] };
    }
  }
  throw new Error(`首页未识别到已绑定的主播、运营或化妆师身份：\n${text}`);
}

async function main() {
  await enableAutomation();
  const miniProgram = await connectWithRetry();
  const runtimeErrors = [];

  miniProgram.on('exception', (error) => {
    runtimeErrors.push(String(error));
    process.stderr.write(`运行时异常：${String(error)}\n`);
  });

  try {
    const { roleCode, scenario } = await detectScenario(miniProgram);
    process.stdout.write(`当前验收身份：${scenario.label}（${roleCode}）\n`);
    for (const [route, expected] of scenario.pages) {
      await assertPageRendered(miniProgram, route, expected);
    }

    if (runtimeErrors.length > 0) {
      throw new Error(`小程序运行时异常：\n${runtimeErrors.join('\n')}`);
    }

    await miniProgram.reLaunch('/pages/index/index');
    process.stdout.write(`${scenario.label}端微信开发者工具逐页冒烟验收通过。\n`);
  } finally {
    miniProgram.disconnect();
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
