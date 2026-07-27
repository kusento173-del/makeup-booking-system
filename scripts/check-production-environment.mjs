import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';

const path = resolve(process.argv[2] ?? 'deploy/production.env');
const environment = parseEnv(readFileSync(path, 'utf8'));
const required = [
  'APP_TIME_ZONE',
  'AUTH_ACCESS_TOKEN_SECRET',
  'AUTH_ACCESS_TOKEN_ISSUER',
  'AUTH_ACCESS_TOKEN_AUDIENCE',
  'INTERNAL_WORKER_TOKEN',
  'DATABASE_URL',
  'BACKUP_DATABASE_URL',
  'REDIS_URL',
];

for (const name of required) {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  if (value.toLowerCase().includes('replace'))
    throw new Error(`${name} still contains a template value`);
}

const secretNames = ['AUTH_ACCESS_TOKEN_SECRET', 'INTERNAL_WORKER_TOKEN'];
for (const name of secretNames) {
  if ((environment[name]?.length ?? 0) < 32)
    throw new Error(`${name} must contain at least 32 characters`);
}

const uniqueSecrets = new Set(secretNames.map((name) => environment[name]));
if (uniqueSecrets.size !== secretNames.length) {
  throw new Error('Production authentication and worker secrets must be different');
}

function assertUrl(name, protocols) {
  const url = new URL(environment[name]);
  if (!protocols.includes(url.protocol))
    throw new Error(`${name} must use ${protocols.join(' or ')}`);
  if (!url.hostname || ['127.0.0.1', 'localhost'].includes(url.hostname)) {
    throw new Error(`${name} must not target localhost`);
  }
  return url;
}

const databaseUrl = assertUrl('DATABASE_URL', ['postgres:', 'postgresql:']);
const backupDatabaseUrl = assertUrl('BACKUP_DATABASE_URL', ['postgres:', 'postgresql:']);
assertUrl('REDIS_URL', ['rediss:']);

for (const [name, url] of [
  ['DATABASE_URL', databaseUrl],
  ['BACKUP_DATABASE_URL', backupDatabaseUrl],
]) {
  const sslMode = url.searchParams.get('sslmode');
  if (!['require', 'verify-ca', 'verify-full'].includes(sslMode ?? '')) {
    throw new Error(`${name} must enable TLS with sslmode=require, verify-ca or verify-full`);
  }
}

if (environment.APP_TIME_ZONE !== 'Asia/Shanghai') {
  throw new Error('APP_TIME_ZONE must be Asia/Shanghai');
}

console.log(`Production environment: ${required.length} required settings verified`);
