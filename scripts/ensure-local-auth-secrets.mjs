import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const SECRET_KEYS = [
  'AUTH_BINDING_CODE_PEPPER',
  'AUTH_ACCESS_TOKEN_SECRET',
  'INTERNAL_WORKER_TOKEN',
];
const TEMPLATE_MARKERS = ['change-me', 'example', 'replace-with'];
const envPath = resolve('.env');

function secretIsUsable(rawValue) {
  const value = rawValue.trim().replace(/^(['"])(.*)\1$/, '$2');
  return (
    value.length >= 32 && !TEMPLATE_MARKERS.some((marker) => value.toLowerCase().includes(marker))
  );
}

function upsertSecret(lines, key) {
  const index = lines.findIndex((line) => line.startsWith(`${key}=`));
  const currentValue = index >= 0 ? lines[index].slice(key.length + 1) : '';
  if (secretIsUsable(currentValue)) {
    return false;
  }

  const line = `${key}=${randomBytes(48).toString('base64url')}`;
  if (index >= 0) {
    lines[index] = line;
  } else {
    lines.push(line);
  }
  return true;
}

let source;
try {
  source = await readFile(envPath, 'utf8');
} catch {
  throw new Error('未找到 .env，请先从 .env.example 复制一份本地配置');
}

const lineEnding = source.includes('\r\n') ? '\r\n' : '\n';
const lines = source.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n');
const generated = SECRET_KEYS.filter((key) => upsertSecret(lines, key));
if (generated.length > 0) {
  await writeFile(envPath, `${lines.join(lineEnding)}${lineEnding}`, 'utf8');
  console.log(`已补齐本地安全配置：${generated.join('、')}`);
} else {
  console.log('本地认证配置已存在，无需修改');
}
