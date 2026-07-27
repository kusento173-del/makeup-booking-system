import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import process from 'node:process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { config } from 'dotenv';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
config({ path: resolve(root, '.env'), quiet: true });

const sourceDatabaseUrl = process.env.DATABASE_URL;
if (!sourceDatabaseUrl) throw new Error('DATABASE_URL is required');

const databaseName = 'makeup_booking_import_rehearsal_20260727';
const rehearsalUrl = new URL(sourceDatabaseUrl);
rehearsalUrl.pathname = `/${databaseName}`;
const adminUrl = new URL(sourceDatabaseUrl);
adminUrl.pathname = '/postgres';
adminUrl.searchParams.delete('schema');

const requireDatabase = createRequire(resolve(root, 'packages/database/package.json'));
const { Client } = requireDatabase('pg');
const pnpm = 'pnpm';

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

function runImport(actorUserId, expectSuccess) {
  const result = spawnSync(
    pnpm,
    [
      'exec',
      'tsx',
      '--tsconfig',
      'apps/api/tsconfig.json',
      'apps/api/src/commands/import-source-data.ts',
      '--confirm',
      `--actor-user-id=${actorUserId}`,
      '--effective-date=2026-07-27',
      `--expected-database=${databaseName}`,
    ],
    {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, DATABASE_URL: rehearsalUrl.toString() },
      shell: process.platform === 'win32',
      stdio: expectSuccess ? 'inherit' : 'pipe',
    },
  );
  if (result.error) throw result.error;
  if ((result.status === 0) !== expectSuccess) {
    throw new Error(`Source import returned unexpected exit code ${result.status}`);
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

async function seedActor() {
  const { createDatabaseClient } = await import('../packages/database/dist/src/index.js');
  const database = createDatabaseClient(rehearsalUrl.toString());
  try {
    return await database.appUser.create({
      data: {
        displayName: '数据迁移管理员',
        roles: { create: { roleCode: 'ADMIN' } },
      },
      select: { id: true },
    });
  } finally {
    await database.$disconnect();
  }
}

async function verify(expectedCounts) {
  const client = new Client({ connectionString: rehearsalUrl.toString() });
  await client.connect();
  try {
    const result = await client.query(`
      SELECT
        (SELECT count(*)::int FROM host_profiles) AS hosts,
        (SELECT count(*)::int FROM artist_profiles) AS artists,
        (SELECT count(*)::int FROM operator_profiles) AS operators,
        (SELECT count(*)::int FROM host_operator_relations) AS relations,
        (SELECT count(*)::int FROM import_batches WHERE status = 'SUCCEEDED') AS batches,
        (SELECT count(*)::int FROM import_rows) AS import_rows,
        (
          SELECT count(*)::int
          FROM host_profiles h
          WHERE NOT EXISTS (
            SELECT 1 FROM host_operator_relations r
            WHERE r.host_id = h.id AND r.valid_until IS NULL
          )
        ) AS unassigned_hosts,
        (
          SELECT count(*)::int
          FROM host_operator_relations r
          JOIN host_profiles h ON h.id = r.host_id
          JOIN operator_profiles o ON o.id = r.operator_id
          WHERE h.site_id <> o.site_id
        ) AS cross_site_relations,
        (
          SELECT count(*)::int
          FROM import_rows
          WHERE validation_status = 'WARNING'
        ) AS warning_rows,
        (
          SELECT count(*)::int
          FROM host_profiles
          WHERE source_import_batch_id IS NULL
        ) + (
          SELECT count(*)::int
          FROM artist_profiles
          WHERE source_import_batch_id IS NULL
        ) + (
          SELECT count(*)::int
          FROM operator_profiles
          WHERE source_import_batch_id IS NULL
        ) + (
          SELECT count(*)::int
          FROM host_operator_relations
          WHERE source_import_batch_id IS NULL
        ) AS missing_provenance
    `);
    const actual = result.rows[0];
    for (const [key, expected] of Object.entries(expectedCounts)) {
      if (actual[key] !== expected) {
        throw new Error(`Import reconciliation failed for ${key}: ${actual[key]} != ${expected}`);
      }
    }
    console.log(JSON.stringify(actual, null, 2));
    return actual;
  } finally {
    await client.end();
  }
}

let failure;
try {
  run(pnpm, ['db:client']);
  await recreateDatabase();
  run(pnpm, ['prisma', 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: rehearsalUrl.toString() },
  });
  const actor = await seedActor();

  runImport(randomUUID(), false);
  await verify({
    artists: 0,
    batches: 0,
    cross_site_relations: 0,
    hosts: 0,
    import_rows: 0,
    missing_provenance: 0,
    operators: 0,
    relations: 0,
    unassigned_hosts: 0,
    warning_rows: 0,
  });

  runImport(actor.id, true);
  const imported = await verify({
    artists: 58,
    batches: 4,
    cross_site_relations: 0,
    hosts: 1235,
    import_rows: 2650,
    missing_provenance: 0,
    operators: 123,
    relations: 1151,
    unassigned_hosts: 84,
    warning_rows: 83,
  });

  run(pnpm, ['db:check'], {
    env: { ...process.env, DATABASE_CHECK_DATABASE: databaseName },
  });
  runImport(actor.id, false);
  await verify(imported);
  console.log('Source import rehearsal passed');
} catch (cause) {
  failure = cause;
} finally {
  if (process.env.SOURCE_IMPORT_KEEP_DATABASE !== 'true') {
    await dropDatabase().catch((cause) => {
      if (!failure) failure = cause;
    });
  }
}

if (failure) throw failure;
