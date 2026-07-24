const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const automator = require('miniprogram-automator');

const projectPath = path.resolve(__dirname, '..');
const cliPath =
  process.env.WECHAT_DEVTOOLS_CLI ?? 'C:\\Program Files (x86)\\Tencent\\微信web开发者工具\\cli.bat';
const automationPort = Number(process.env.WECHAT_AUTOMATION_PORT ?? 9420);
const routes = [
  '/pages/index/index',
  '/pages/schedule/index',
  '/pages/booking/index',
  '/pages/shift/index',
  '/pages/leave/index',
  '/pages/overtime/index',
  '/pages/unavailability/index',
  '/pages/fixed/index',
  '/pages/managed-hosts/index',
  '/pages/feature/index',
];

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

async function assertPageRendered(miniProgram, route) {
  const page = await miniProgram.reLaunch(route);
  if (!page || page.path !== route.slice(1)) {
    throw new Error(`${route} 未进入目标页面`);
  }

  await new Promise((resolve) => setTimeout(resolve, 300));
  const views = await page.$$('view');
  if (views.length === 0) {
    throw new Error(`${route} 页面实例存在，但没有渲染任何视图`);
  }

  process.stdout.write(`✓ ${route}（${views.length} 个视图）\n`);
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
    for (const route of routes) {
      await assertPageRendered(miniProgram, route);
    }

    if (runtimeErrors.length > 0) {
      throw new Error(`小程序运行时异常：\n${runtimeErrors.join('\n')}`);
    }

    await miniProgram.reLaunch('/pages/index/index');
    process.stdout.write('微信开发者工具逐页冒烟验收通过。\n');
  } finally {
    miniProgram.disconnect();
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
