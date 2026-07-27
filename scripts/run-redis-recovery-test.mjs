import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { config } from 'dotenv';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
config({ path: resolve(root, '.env'), quiet: true });

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');

const requireDatabase = createRequire(resolve(root, 'packages/database/package.json'));
const requireApi = createRequire(resolve(root, 'apps/api/package.json'));
const { Client } = requireDatabase('pg');
const { AccessTokenService } = requireApi('./dist/auth/access-token.service.js');
let api;
let baseUrl;
let client;
let redisStopped = false;
let sessionId;

function runDocker(args) {
  const result = spawnSync('docker', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`docker ${args.join(' ')} failed`);
}

function sleep(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

function findFreePort() {
  return new Promise((resolvePromise, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Unable to allocate a local API port'));
        return;
      }
      server.close((error) => (error ? reject(error) : resolvePromise(address.port)));
    });
  });
}

async function request(path, options = {}) {
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      signal: AbortSignal.timeout(5_000),
    });
    return { body: await response.text(), status: response.status };
  } catch (error) {
    return {
      body: error instanceof Error ? error.message : 'request failed',
      status: 0,
    };
  }
}

async function waitForHealth(expectedHealthy) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (api?.exitCode !== null) {
      throw new Error(`Redis recovery API exited unexpectedly (${api?.exitCode})`);
    }
    const result = await request('/health');
    if ((result.status === 200) === expectedHealthy) return result;
    await sleep(500);
  }
  throw new Error(`API did not become ${expectedHealthy ? 'healthy' : 'unhealthy'}`);
}

async function createSession() {
  const adminResult = await client.query(`
    SELECT u.id AS user_id, r.id AS role_id
    FROM app_users u
    JOIN user_roles r ON r.user_id = u.id
    WHERE u.status = 'ACTIVE'
      AND r.role_code = 'ADMIN'
      AND r.revoked_at IS NULL
    ORDER BY r.created_at
    LIMIT 1
  `);
  const admin = adminResult.rows[0];
  if (!admin) throw new Error('No active administrator is available');

  const refreshToken = randomBytes(32).toString('base64url');
  const refreshTokenHash = createHash('sha256').update(refreshToken).digest('hex');
  const sessionResult = await client.query(
    `
      INSERT INTO auth_sessions (
        user_id,
        role_assignment_id,
        refresh_token_hash,
        expires_at
      )
      VALUES ($1, $2, $3, NOW() + INTERVAL '1 day')
      RETURNING id
    `,
    [admin.user_id, admin.role_id, refreshTokenHash],
  );
  sessionId = sessionResult.rows[0].id;
  const access = await new AccessTokenService().issue(admin.user_id, sessionId, {
    roleAssignmentId: admin.role_id,
    roleCode: 'ADMIN',
    siteId: null,
  });
  return { accessToken: access.token, refreshToken };
}

async function loadBoardPath() {
  const result = await client.query(`
    SELECT
      site.id,
      COALESCE(
        (SELECT MAX(appointment_date)::text FROM appointments),
        CURRENT_DATE::text
      ) AS board_date
    FROM sites site
    WHERE site.status = 'ACTIVE'
    ORDER BY site.code
    LIMIT 1
  `);
  const fixture = result.rows[0];
  if (!fixture) throw new Error('No active site is available');
  return `/schedule-board?${new URLSearchParams({
    date: fixture.board_date,
    siteId: fixture.id,
  })}`;
}

try {
  client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const session = await createSession();
  const boardPath = await loadBoardPath();
  const port = await findFreePort();
  baseUrl = `http://127.0.0.1:${port}`;
  api = spawn(process.execPath, ['apps/api/dist/main.js'], {
    cwd: root,
    env: { ...process.env, API_PORT: String(port), NODE_ENV: 'test' },
    stdio: ['ignore', 'inherit', 'inherit'],
  });

  await waitForHealth(true);
  const before = await request(boardPath, {
    headers: { Authorization: `Bearer ${session.accessToken}` },
  });
  if (before.status !== 200) throw new Error(`Baseline board request returned ${before.status}`);

  runDocker(['compose', 'stop', 'redis']);
  redisStopped = true;
  const degradedHealth = await waitForHealth(false);
  const degradedBoard = await request(boardPath, {
    headers: { Authorization: `Bearer ${session.accessToken}` },
  });
  const degradedRefresh = await request('/auth/refresh', {
    body: JSON.stringify({ refreshToken: session.refreshToken }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  });
  if (degradedBoard.status !== 200 || degradedRefresh.status !== 503) {
    throw new Error(
      `Unexpected degraded behavior: health=${degradedHealth.status}, board=${degradedBoard.status}, refresh=${degradedRefresh.status}`,
    );
  }

  runDocker(['compose', 'up', '--detach', '--wait', 'redis']);
  redisStopped = false;
  await waitForHealth(true);
  const recoveredRefresh = await request('/auth/refresh', {
    body: JSON.stringify({ refreshToken: session.refreshToken }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  });
  if (recoveredRefresh.status !== 200) {
    throw new Error(`Refresh did not recover without API restart (${recoveredRefresh.status})`);
  }
  console.log(
    `[redis-recovery] PASS ${JSON.stringify({
      degradedBoard: degradedBoard.status,
      degradedHealth: degradedHealth.status,
      degradedRefresh: degradedRefresh.status,
      recoveredHealth: 200,
      recoveredRefresh: recoveredRefresh.status,
    })}`,
  );
} finally {
  if (redisStopped) {
    runDocker(['compose', 'up', '--detach', '--wait', 'redis']);
  }
  if (client && sessionId) {
    await client
      .query(
        `
          UPDATE auth_sessions
          SET revoked_at = COALESCE(revoked_at, NOW()),
              revoke_reason = COALESCE(revoke_reason, 'REDIS_RECOVERY_TEST_FINISHED')
          WHERE id = $1
        `,
        [sessionId],
      )
      .catch(() => undefined);
  }
  if (client) await client.end().catch(() => undefined);
  if (api && api.exitCode === null) {
    api.kill('SIGTERM');
    await Promise.race([
      new Promise((resolvePromise) => api.once('exit', resolvePromise)),
      sleep(5_000),
    ]);
    if (api.exitCode === null) api.kill('SIGKILL');
  }
}
