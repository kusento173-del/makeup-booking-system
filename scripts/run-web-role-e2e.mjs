import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { config } from 'dotenv';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
config({ path: resolve(root, '.env'), quiet: true });

const sourceDatabaseUrl = process.env.DATABASE_URL;
if (!sourceDatabaseUrl) {
  throw new Error('DATABASE_URL is required');
}

const databaseName = 'makeup_booking_web_e2e';
const qaUrl = new URL(sourceDatabaseUrl);
qaUrl.pathname = `/${databaseName}`;
const adminUrl = new URL(sourceDatabaseUrl);
adminUrl.pathname = '/postgres';
adminUrl.searchParams.delete('schema');

const requireDatabase = createRequire(resolve(root, 'packages/database/package.json'));
const requireApi = createRequire(resolve(root, 'apps/api/package.json'));
const { Client } = requireDatabase('pg');
const { Algorithm, hash } = requireApi('@node-rs/argon2');
const pnpm = 'pnpm';
const password = `Qa!${randomBytes(18).toString('base64url')}`;
const workerToken = randomBytes(32).toString('base64url');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    stdio: 'inherit',
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}`);
  }
}

async function recreateDatabase() {
  const client = new Client({ connectionString: adminUrl.toString() });
  await client.connect();
  try {
    await client.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
    await client.query(`CREATE DATABASE "${databaseName}"`);
  } finally {
    await client.end();
  }
}

async function dropDatabase() {
  const client = new Client({ connectionString: adminUrl.toString() });
  await client.connect();
  try {
    await client.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
  } finally {
    await client.end();
  }
}

async function seed() {
  const { createDatabaseClient } = await import('../packages/database/dist/src/index.js');
  const database = createDatabaseClient(qaUrl.toString());
  const passwordHash = await hash(password, {
    algorithm: Algorithm.Argon2id,
    memoryCost: 19_456,
    outputLen: 32,
    parallelism: 1,
    timeCost: 2,
  });
  try {
    const sites = await database.site.findMany({
      select: { code: true, id: true },
      where: { code: { in: ['SONGJIANG', 'XIANCHANG'] } },
    });
    const siteByCode = new Map(sites.map((site) => [site.code, site.id]));
    const songjiangId = siteByCode.get('SONGJIANG');
    const xianchangId = siteByCode.get('XIANCHANG');
    if (!songjiangId || !xianchangId) throw new Error('Required QA sites are missing');

    async function account(loginName, displayName, roleCode, siteId) {
      return database.appUser.create({
        data: {
          displayName,
          identities: {
            create: {
              externalSubject: loginName.toLocaleLowerCase('en-US'),
              provider: 'PASSWORD',
              providerAppId: 'BACKOFFICE',
            },
          },
          passwordCredential: {
            create: { mustChangePassword: false, passwordHash },
          },
          roles: {
            create: { roleCode, siteId: siteId ?? null },
          },
        },
        select: { id: true },
      });
    }

    const admin = await account('qa-admin', '全量测试管理员', 'ADMIN');
    await account('qa-cs-songjiang', '全量测试松江客服', 'CUSTOMER_SERVICE', songjiangId);
    await account('qa-cs-xianchang', '全量测试现厂客服', 'CUSTOMER_SERVICE', xianchangId);
    const hostUser = await account('QA000001', '全量测试主播', 'HOST', songjiangId);
    const hostTwoUser = await account('QA000002', '全量测试现厂主播', 'HOST', xianchangId);
    const operatorUser = await account(
      'qa-operator-songjiang',
      '全量测试松江运营',
      'OPERATOR',
      songjiangId,
    );
    const operatorTwoUser = await account(
      'qa-operator-xianchang',
      '全量测试现厂运营',
      'OPERATOR',
      xianchangId,
    );
    const artistUser = await account(
      'qa-artist-songjiang',
      '全量测试松江化妆师',
      'ARTIST',
      songjiangId,
    );
    const artistTwoUser = await account(
      'qa-artist-xianchang',
      '全量测试现厂化妆师',
      'ARTIST',
      xianchangId,
    );

    const host = await database.hostProfile.create({
      data: {
        hostCode: 'QA000001',
        nickname: '全量测试主播',
        realName: '全量测试主播',
        siteId: songjiangId,
        userId: hostUser.id,
      },
      select: { id: true },
    });
    await database.hostProfile.create({
      data: {
        hostCode: 'QA000002',
        nickname: '全量测试现厂主播',
        realName: '全量测试现厂主播',
        siteId: xianchangId,
        userId: hostTwoUser.id,
      },
    });
    const operator = await database.operatorProfile.create({
      data: {
        nameNormalized: '全量测试松江运营',
        realName: '全量测试松江运营',
        siteId: songjiangId,
        userId: operatorUser.id,
      },
      select: { id: true },
    });
    await database.operatorProfile.create({
      data: {
        nameNormalized: '全量测试现厂运营',
        realName: '全量测试现厂运营',
        siteId: xianchangId,
        userId: operatorTwoUser.id,
      },
    });
    const artist = await database.artistProfile.create({
      data: {
        initialShiftConfiguredAt: new Date(),
        nickname: '全量测试松江化妆师',
        nicknameNormalized: '全量测试松江化妆师',
        realName: '全量测试松江化妆师',
        siteId: songjiangId,
        userId: artistUser.id,
      },
      select: { id: true },
    });
    const artistTwo = await database.artistProfile.create({
      data: {
        initialShiftConfiguredAt: new Date(),
        nickname: '全量测试现厂化妆师',
        nicknameNormalized: '全量测试现厂化妆师',
        realName: '全量测试现厂化妆师',
        siteId: xianchangId,
        userId: artistTwoUser.id,
      },
      select: { id: true },
    });
    const validFrom = new Date('2026-01-01T00:00:00.000Z');
    await database.artistShiftTemplate.createMany({
      data: [
        {
          artistId: artist.id,
          breakEndMinute: 780,
          breakStartMinute: 720,
          createdByUserId: admin.id,
          validFrom,
          versionNo: 1,
          workEndMinute: 1080,
          workStartMinute: 540,
          workdays: [1, 2, 3, 4, 5],
        },
        {
          artistId: artistTwo.id,
          breakEndMinute: 780,
          breakStartMinute: 720,
          createdByUserId: admin.id,
          validFrom,
          versionNo: 1,
          workEndMinute: 1080,
          workStartMinute: 540,
          workdays: [1, 2, 3, 4, 5],
        },
      ],
    });
    await database.hostOperatorRelation.create({
      data: {
        changeReason: '全量网页验收夹具',
        hostId: host.id,
        operatorId: operator.id,
        validFrom,
      },
    });
  } finally {
    await database.$disconnect();
  }
}

let failure;
try {
  if (process.env.WEB_E2E_SKIP_BUILD !== 'true') run(pnpm, ['build']);
  await recreateDatabase();
  run(pnpm, ['prisma', 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: qaUrl.toString() },
  });
  await seed();
  run(pnpm, ['exec', 'playwright', 'test', '--config', 'playwright.web-roles.config.ts'], {
    env: {
      ...process.env,
      WEB_E2E_DATABASE_URL: qaUrl.toString(),
      WEB_E2E_API_URL: 'http://127.0.0.1:3200',
      WEB_E2E_PASSWORD: password,
      WEB_E2E_WORKER_TOKEN: workerToken,
    },
  });
} catch (cause) {
  failure = cause;
} finally {
  if (process.env.WEB_E2E_KEEP_DATABASE !== 'true') {
    await dropDatabase().catch((cause) => {
      if (!failure) failure = cause;
    });
  }
}

if (failure) throw failure;
