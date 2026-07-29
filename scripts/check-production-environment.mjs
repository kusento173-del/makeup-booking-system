import { readFileSync } from 'node:fs';
import { isIP } from 'node:net';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';

const path = resolve(process.argv[2] ?? 'deploy/production.env');
const environment = parseEnv(readFileSync(path, 'utf8'));
const deploymentMode = environment.DEPLOYMENT_MODE?.trim() || 'managed';
const required = [
  'DEPLOYMENT_MODE',
  'APP_TIME_ZONE',
  'AUTH_ACCESS_TOKEN_SECRET',
  'AUTH_ACCESS_TOKEN_ISSUER',
  'AUTH_ACCESS_TOKEN_AUDIENCE',
  'INTERNAL_WORKER_TOKEN',
  'DATABASE_URL',
  'BACKUP_DATABASE_URL',
  'REDIS_URL',
];

if (deploymentMode === 'single-server') {
  required.push(
    'GATEWAY_TARGET',
    'PUBLIC_IP',
    'CERTBOT_EMAIL',
    'POSTGRES_DB',
    'POSTGRES_USER',
    'POSTGRES_PASSWORD',
    'REDIS_PASSWORD',
  );
} else if (deploymentMode !== 'managed') {
  throw new Error('DEPLOYMENT_MODE must be managed or single-server');
}

for (const name of required) {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  if (value.toLowerCase().includes('replace'))
    throw new Error(`${name} still contains a template value`);
}

const secretNames = ['AUTH_ACCESS_TOKEN_SECRET', 'INTERNAL_WORKER_TOKEN'];
if (deploymentMode === 'single-server') {
  secretNames.push('POSTGRES_PASSWORD', 'REDIS_PASSWORD');
}

for (const name of secretNames) {
  const minimumLength = ['POSTGRES_PASSWORD', 'REDIS_PASSWORD'].includes(name) ? 24 : 32;
  if ((environment[name]?.length ?? 0) < minimumLength)
    throw new Error(`${name} must contain at least ${minimumLength} characters`);
}

const uniqueSecrets = new Set(secretNames.map((name) => environment[name]));
if (uniqueSecrets.size !== secretNames.length) {
  throw new Error('Production secrets and service passwords must all be different');
}

function assertUrl(name, protocols, allowedHosts) {
  const url = new URL(environment[name]);
  if (!protocols.includes(url.protocol))
    throw new Error(`${name} must use ${protocols.join(' or ')}`);
  if (!url.hostname) throw new Error(`${name} must include a hostname`);
  if (allowedHosts && !allowedHosts.includes(url.hostname)) {
    throw new Error(`${name} must target ${allowedHosts.join(' or ')}`);
  }
  if (!allowedHosts && ['127.0.0.1', 'localhost'].includes(url.hostname)) {
    throw new Error(`${name} must not target localhost`);
  }
  return url;
}

const databaseUrl = assertUrl(
  'DATABASE_URL',
  ['postgres:', 'postgresql:'],
  deploymentMode === 'single-server' ? ['postgres'] : undefined,
);
const backupDatabaseUrl = assertUrl(
  'BACKUP_DATABASE_URL',
  ['postgres:', 'postgresql:'],
  deploymentMode === 'single-server' ? ['postgres'] : undefined,
);
const redisUrl = assertUrl(
  'REDIS_URL',
  deploymentMode === 'single-server' ? ['redis:'] : ['rediss:'],
  deploymentMode === 'single-server' ? ['redis'] : undefined,
);

if (deploymentMode === 'single-server') {
  const postgresUser = environment.POSTGRES_USER;
  const postgresPassword = environment.POSTGRES_PASSWORD;
  const postgresDatabase = environment.POSTGRES_DB;
  const databasePath = `/${postgresDatabase}`;

  if (
    !/^[A-Za-z0-9_-]+$/.test(postgresPassword) ||
    !/^[A-Za-z0-9_-]+$/.test(environment.REDIS_PASSWORD)
  ) {
    throw new Error('Single-server database and Redis passwords must use letters, digits, _ or -');
  }
  for (const [name, url] of [
    ['DATABASE_URL', databaseUrl],
    ['BACKUP_DATABASE_URL', backupDatabaseUrl],
  ]) {
    if (
      url.username !== postgresUser ||
      url.password !== postgresPassword ||
      url.pathname !== databasePath
    ) {
      throw new Error(`${name} credentials and database must match POSTGRES_* settings`);
    }
  }
  if (redisUrl.password !== environment.REDIS_PASSWORD) {
    throw new Error('REDIS_URL password must match REDIS_PASSWORD');
  }
  if (environment.GATEWAY_TARGET !== 'gateway') {
    throw new Error('GATEWAY_TARGET must be gateway after the initial HTTP certificate challenge');
  }
  if (!isIP(environment.PUBLIC_IP)) {
    throw new Error('PUBLIC_IP must be a valid public IPv4 or IPv6 address');
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(environment.CERTBOT_EMAIL)) {
    throw new Error('CERTBOT_EMAIL must be a valid certificate contact email');
  }
} else {
  for (const [name, url] of [
    ['DATABASE_URL', databaseUrl],
    ['BACKUP_DATABASE_URL', backupDatabaseUrl],
  ]) {
    const sslMode = url.searchParams.get('sslmode');
    if (!['require', 'verify-ca', 'verify-full'].includes(sslMode ?? '')) {
      throw new Error(`${name} must enable TLS with sslmode=require, verify-ca or verify-full`);
    }
  }
}

if (environment.APP_TIME_ZONE !== 'Asia/Shanghai') {
  throw new Error('APP_TIME_ZONE must be Asia/Shanghai');
}

console.log(
  `Production environment: ${deploymentMode}, ${required.length} required settings verified`,
);
