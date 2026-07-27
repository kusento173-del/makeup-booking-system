import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { config } from 'dotenv';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
config({ path: resolve(root, '.env'), quiet: true });

const sourceDatabaseUrl = process.env.DATABASE_URL;
if (!sourceDatabaseUrl) throw new Error('DATABASE_URL is required');

const databaseName = process.env.CAPACITY_DATABASE_NAME || 'makeup_booking_perf_20260726';
const databaseUrl = new URL(sourceDatabaseUrl);
databaseUrl.pathname = `/${databaseName}`;
const requestedApiPort = process.env.CAPACITY_API_PORT
  ? Number(process.env.CAPACITY_API_PORT)
  : null;
const concurrency = Number(process.env.CAPACITY_CONCURRENCY || 600);
const durationSeconds = Number(process.env.CAPACITY_DURATION_SECONDS || 900);
const exportStorageDirectory = resolve(root, 'tmp', 'capacity-exports');
let apiPort;
let baseUrl;
const requireDatabase = createRequire(resolve(root, 'packages/database/package.json'));
const requireApi = createRequire(resolve(root, 'apps/api/package.json'));
const { Client } = requireDatabase('pg');
const { AccessTokenService } = requireApi('./dist/auth/access-token.service.js');

if (
  (requestedApiPort !== null && !Number.isInteger(requestedApiPort)) ||
  !Number.isInteger(concurrency) ||
  !Number.isInteger(durationSeconds) ||
  concurrency < 1 ||
  durationSeconds < 1
) {
  throw new Error('Capacity test settings are invalid');
}

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

function businessDate(offsetDays = 0) {
  const now = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat('sv-SE', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
  }).format(now);
}

function isoWeekday(date) {
  const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  return weekday === 0 ? 7 : weekday;
}

function percentile(values, percentage) {
  if (values.length === 0) return 0;
  const sorted = values.toSorted((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * percentage) - 1)];
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
      const { port } = address;
      server.close((error) => (error ? reject(error) : resolvePromise(port)));
    });
  });
}

async function waitForApi() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (api?.exitCode !== null) {
      throw new Error(`Capacity API exited before becoming healthy (${api?.exitCode})`);
    }
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return;
    } catch {
      // The child process can need several seconds for its first connection.
    }
    await sleep(500);
  }
  throw new Error('Capacity API did not become healthy');
}

async function query(client, text, values = []) {
  return (await client.query(text, values)).rows;
}

async function createTestSession(client) {
  const [admin] = await query(
    client,
    `
      SELECT u.id AS user_id, r.id AS role_id
      FROM app_users u
      JOIN user_roles r ON r.user_id = u.id
      WHERE u.status = 'ACTIVE'
        AND r.role_code = 'ADMIN'
        AND r.revoked_at IS NULL
      ORDER BY r.created_at
      LIMIT 1
    `,
  );
  if (!admin) throw new Error('The capacity database has no active administrator');

  const refreshTokenHash = createHash('sha256').update(randomBytes(64)).digest('hex');
  const [session] = await query(
    client,
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
  const role = {
    roleAssignmentId: admin.role_id,
    roleCode: 'ADMIN',
    siteId: null,
  };
  const tokens = new AccessTokenService();
  const issue = () => tokens.issue(admin.user_id, session.id, role);
  return { issue, sessionId: session.id };
}

async function loadFixtures(client, date) {
  const weekday = isoWeekday(date);
  const sites = await query(
    client,
    `SELECT id, code FROM sites WHERE status = 'ACTIVE' ORDER BY code`,
  );
  const [boardDate] = await query(
    client,
    `
      SELECT appointment_date::text AS value
      FROM appointments
      GROUP BY appointment_date
      ORDER BY COUNT(*) DESC, appointment_date DESC
      LIMIT 1
    `,
  );
  const pairs = await query(
    client,
    `
      SELECT h.id AS host_id, candidate.artist_id, h.site_id
      FROM host_profiles h
      JOIN sites s ON s.id = h.site_id AND s.status = 'ACTIVE'
      JOIN LATERAL (
        SELECT a.id AS artist_id
        FROM artist_profiles a
        JOIN artist_shift_templates shift
          ON shift.artist_id = a.id
         AND shift.valid_from <= $1::date
         AND (shift.valid_until IS NULL OR shift.valid_until > $1::date)
         AND $2::smallint = ANY(shift.workdays)
        WHERE a.site_id = h.site_id
          AND a.employment_status = 'ACTIVE'
          AND NOT EXISTS (
            SELECT 1
            FROM leave_records leave_record
            WHERE leave_record.artist_id = a.id
              AND leave_record.status = 'ACTIVE'
              AND leave_record.start_date <= $1::date
              AND leave_record.end_date >= $1::date
          )
        ORDER BY a.id
        LIMIT 1
      ) candidate ON TRUE
      WHERE h.qualification_status = 'ACTIVE'
        AND NOT EXISTS (
          SELECT 1
          FROM leave_records leave_record
          WHERE leave_record.host_id = h.id
            AND leave_record.status = 'ACTIVE'
            AND leave_record.start_date <= $1::date
            AND leave_record.end_date >= $1::date
        )
        AND (
          SELECT COUNT(*)
          FROM appointments appointment
          WHERE appointment.host_id = h.id
            AND appointment.appointment_date = $1::date
            AND appointment.status IN ('BOOKED', 'COMPLETED')
        ) < 2
      ORDER BY h.id
      LIMIT 300
    `,
    [date, weekday],
  );
  if (sites.length === 0 || !boardDate?.value || pairs.length === 0) {
    throw new Error('The capacity database does not contain the required production fixtures');
  }
  return { boardDate: boardDate.value, pairs, sites };
}

async function request(path, token, options = {}) {
  const startedAt = performance.now();
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  const body = await response.text();
  return {
    body,
    bytes: Buffer.byteLength(body),
    duration: performance.now() - startedAt,
    status: response.status,
  };
}

async function findOpenSlot(token, pairs, date) {
  for (const pair of pairs) {
    const queryString = new URLSearchParams({
      artistId: pair.artist_id,
      date,
      durationMinutes: '30',
      hostId: pair.host_id,
    });
    const response = await request(`/booking-slots?${queryString}`, token);
    if (response.status !== 200) continue;
    const result = JSON.parse(response.body);
    if (result.slots?.length > 0) {
      return { ...pair, startMinute: result.slots[0].startMinute };
    }
  }
  throw new Error('No open slot was found for the same-slot race test');
}

async function runSameSlotRace(getToken, fixtures, date) {
  const pair = await findOpenSlot(getToken(), fixtures.pairs, date);
  const payload = JSON.stringify({
    artistId: pair.artist_id,
    confirmedSecondBooking: false,
    date,
    durationMinutes: 30,
    hostId: pair.host_id,
    reason: '全网页端并发抢档验证',
    startMinute: pair.startMinute,
  });
  const responses = await Promise.all(
    Array.from({ length: 100 }, () =>
      request('/appointments', getToken(), {
        body: payload,
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': randomUUID(),
        },
        method: 'POST',
      }),
    ),
  );
  const created = responses.filter((response) => response.status === 201);
  const conflicts = responses.filter((response) => response.status === 409);
  const unexpected = responses.filter(
    (response) => response.status !== 201 && response.status !== 409,
  );
  if (created.length !== 1 || conflicts.length !== 99 || unexpected.length > 0) {
    throw new Error(
      `Same-slot race failed: created=${created.length}, conflicts=${conflicts.length}, unexpected=${unexpected.length}`,
    );
  }

  const appointment = JSON.parse(created[0].body).appointment;
  const cancellation = await request(`/appointments/${appointment.id}/cancel`, getToken(), {
    body: JSON.stringify({
      expectedRowVersion: appointment.rowVersion,
      reason: '并发抢档验证完成后清理',
    }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  });
  if (cancellation.status !== 200) {
    throw new Error(`Race-test cleanup failed with HTTP ${cancellation.status}`);
  }
  console.log(
    `[capacity] same-slot race passed: 1 created, 99 conflicts, p95=${percentile(
      responses.map((response) => response.duration),
      0.95,
    ).toFixed(0)}ms`,
  );
}

async function runWorkerAndExport(getToken, fixtures) {
  const workerToken = process.env.INTERNAL_WORKER_TOKEN;
  if (!workerToken || Buffer.byteLength(workerToken) < 32) {
    throw new Error('INTERNAL_WORKER_TOKEN must contain at least 32 bytes');
  }
  const workerHeaders = { 'X-Worker-Token': workerToken };
  const generationStartedAt = performance.now();
  const generation = await request('/internal/jobs/fixed-generation', getToken(), {
    headers: workerHeaders,
    method: 'POST',
  });
  const generationMilliseconds = performance.now() - generationStartedAt;
  if (generation.status !== 200) {
    throw new Error(`Fixed generation failed with HTTP ${generation.status}`);
  }

  const exportCreation = await request('/export-jobs', getToken(), {
    body: JSON.stringify({
      scheduleDate: fixtures.boardDate,
      scope: 'ALL_SITES',
    }),
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': randomUUID(),
    },
    method: 'POST',
  });
  if (exportCreation.status !== 201) {
    throw new Error(`Export creation failed with HTTP ${exportCreation.status}`);
  }
  const exportJob = JSON.parse(exportCreation.body);
  const exportStartedAt = performance.now();
  let processed;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const result = await request('/internal/jobs/schedule-export', getToken(), {
      headers: workerHeaders,
      method: 'POST',
    });
    if (result.status !== 200) {
      throw new Error(`Export worker failed with HTTP ${result.status}`);
    }
    const current = JSON.parse(result.body);
    if (current.exportJobId === exportJob.id) {
      processed = current;
      break;
    }
  }
  const exportMilliseconds = performance.now() - exportStartedAt;
  if (!processed || processed.status !== 'SUCCEEDED') {
    throw new Error('The production-scale export job was not completed');
  }
  const download = await fetch(`${baseUrl}/export-jobs/${exportJob.id}/download`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  const workbook = Buffer.from(await download.arrayBuffer());
  if (download.status !== 200 || workbook.subarray(0, 2).toString('ascii') !== 'PK') {
    throw new Error(`Export download validation failed with HTTP ${download.status}`);
  }
  console.log(
    `[capacity] worker/export passed: fixed-generation=${generationMilliseconds.toFixed(
      0,
    )}ms, export=${exportMilliseconds.toFixed(0)}ms, xlsx-bytes=${workbook.byteLength}`,
  );
}

async function runSustainedLoad(getToken, fixtures, date) {
  const metrics = {
    board: [],
    bytes: 0,
    failed: 0,
    slots: [],
    statuses: new Map(),
    total: 0,
  };
  const startedAt = Date.now();
  const deadline = startedAt + durationSeconds * 1000;
  let lastProgress = startedAt;

  const workers = Array.from({ length: concurrency }, async (_, workerIndex) => {
    await sleep(Math.random() * 1_000);
    let sequence = workerIndex;
    while (Date.now() < deadline) {
      const boardRequest = sequence % 2 === 0;
      const site = fixtures.sites[sequence % fixtures.sites.length];
      const pair = fixtures.pairs[sequence % fixtures.pairs.length];
      const path = boardRequest
        ? `/schedule-board?${new URLSearchParams({
            date: fixtures.boardDate,
            siteId: site.id,
          })}`
        : `/booking-slots?${new URLSearchParams({
            artistId: pair.artist_id,
            date,
            durationMinutes: '30',
            hostId: pair.host_id,
          })}`;
      try {
        const response = await request(path, getToken());
        metrics.total += 1;
        metrics.bytes += response.bytes;
        metrics.statuses.set(response.status, (metrics.statuses.get(response.status) || 0) + 1);
        (boardRequest ? metrics.board : metrics.slots).push(response.duration);
        if (response.status !== 200) metrics.failed += 1;
      } catch {
        metrics.total += 1;
        metrics.failed += 1;
        metrics.statuses.set(0, (metrics.statuses.get(0) || 0) + 1);
      }
      sequence += concurrency;
      await sleep(1_500 + Math.random() * 1_500);
    }
  });

  while (Date.now() < deadline) {
    await sleep(Math.min(1_000, Math.max(1, deadline - Date.now())));
    const now = Date.now();
    if (now - lastProgress >= 30_000) {
      const elapsed = (now - startedAt) / 1_000;
      console.log(
        `[capacity] ${elapsed.toFixed(0)}s: requests=${metrics.total}, failed=${
          metrics.failed
        }, rate=${(metrics.total / elapsed).toFixed(2)}/s, board-p95=${percentile(
          metrics.board,
          0.95,
        ).toFixed(0)}ms, slots-p95=${percentile(metrics.slots, 0.95).toFixed(0)}ms`,
      );
      lastProgress = now;
    }
  }
  await Promise.all(workers);
  const elapsedSeconds = (Date.now() - startedAt) / 1_000;
  return {
    boardP95Milliseconds: percentile(metrics.board, 0.95),
    bytes: metrics.bytes,
    concurrency,
    durationSeconds: elapsedSeconds,
    failed: metrics.failed,
    requests: metrics.total,
    requestsPerSecond: metrics.total / elapsedSeconds,
    slotP95Milliseconds: percentile(metrics.slots, 0.95),
    statuses: Object.fromEntries(
      [...metrics.statuses.entries()].sort(([left], [right]) => left - right),
    ),
  };
}

async function assertDatabaseConsistency(client) {
  const [result] = await query(
    client,
    `
      SELECT
        (
          SELECT COUNT(*)
          FROM appointments left_appointment
          JOIN appointments right_appointment
            ON left_appointment.artist_id = right_appointment.artist_id
           AND left_appointment.appointment_date = right_appointment.appointment_date
           AND left_appointment.id < right_appointment.id
           AND left_appointment.status IN ('BOOKED', 'COMPLETED')
           AND right_appointment.status IN ('BOOKED', 'COMPLETED')
           AND left_appointment.start_at < right_appointment.end_at
           AND right_appointment.start_at < left_appointment.end_at
        ) AS artist_overlaps,
        (
          SELECT COUNT(*)
          FROM appointments left_appointment
          JOIN appointments right_appointment
            ON left_appointment.host_id = right_appointment.host_id
           AND left_appointment.appointment_date = right_appointment.appointment_date
           AND left_appointment.id < right_appointment.id
           AND left_appointment.status IN ('BOOKED', 'COMPLETED')
           AND right_appointment.status IN ('BOOKED', 'COMPLETED')
           AND left_appointment.start_at < right_appointment.end_at
           AND right_appointment.start_at < left_appointment.end_at
        ) AS host_overlaps,
        (
          SELECT COUNT(*)
          FROM (
            SELECT host_id, appointment_date
            FROM appointments
            WHERE status IN ('BOOKED', 'COMPLETED')
            GROUP BY host_id, appointment_date
            HAVING COUNT(*) > 2
          ) invalid_host_days
        ) AS host_daily_limit_violations,
        (
          SELECT COUNT(*)
          FROM (
            SELECT fixed_rule_id, appointment_date
            FROM appointments
            WHERE fixed_rule_id IS NOT NULL
            GROUP BY fixed_rule_id, appointment_date
            HAVING COUNT(*) > 1
          ) duplicate_fixed_days
        ) AS duplicate_fixed_days
    `,
  );
  const failures = Object.entries(result).filter(([, value]) => Number(value) !== 0);
  if (failures.length > 0) {
    throw new Error(`Database consistency failed: ${JSON.stringify(result)}`);
  }
  return result;
}

let api;
let client;
let sessionId;
try {
  apiPort = requestedApiPort ?? (await findFreePort());
  baseUrl = `http://127.0.0.1:${apiPort}`;
  console.log(`[capacity] applying current migrations to isolated database ${databaseName}`);
  run('pnpm', ['db:migrate'], {
    env: { ...process.env, DATABASE_URL: databaseUrl.toString() },
  });
  run('pnpm', ['--filter', '@makeup/api', 'build']);

  client = new Client({ connectionString: databaseUrl.toString() });
  await client.connect();
  const targetDate = businessDate(1);
  const fixtures = await loadFixtures(client, targetDate);
  const session = await createTestSession(client);
  sessionId = session.sessionId;
  let activeToken = (await session.issue()).token;
  const getToken = () => activeToken;

  api = spawn(process.execPath, ['apps/api/dist/main.js'], {
    cwd: root,
    env: {
      ...process.env,
      API_PORT: String(apiPort),
      DATABASE_URL: databaseUrl.toString(),
      EXPORT_STORAGE_DIR: exportStorageDirectory,
      NODE_ENV: 'test',
    },
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  await waitForApi();
  console.log(
    `[capacity] fixtures ready: sites=${fixtures.sites.length}, pairs=${fixtures.pairs.length}, boardDate=${fixtures.boardDate}, bookingDate=${targetDate}`,
  );

  await runWorkerAndExport(getToken, fixtures);
  await runSameSlotRace(getToken, fixtures, targetDate);
  const refreshTimer = setInterval(() => {
    void session.issue().then((issued) => {
      activeToken = issued.token;
      console.log('[capacity] access token renewed');
    });
  }, 7 * 60_000);
  const summary = await runSustainedLoad(getToken, fixtures, targetDate);
  clearInterval(refreshTimer);
  const consistency = await assertDatabaseConsistency(client);
  const health = await fetch(`${baseUrl}/health`);

  if (
    summary.failed !== 0 ||
    summary.boardP95Milliseconds >= 2_000 ||
    summary.slotP95Milliseconds >= 2_000 ||
    !health.ok
  ) {
    throw new Error(`Capacity acceptance failed: ${JSON.stringify(summary)}`);
  }
  console.log(`[capacity] PASS ${JSON.stringify({ ...summary, consistency })}`);
} finally {
  if (client && sessionId) {
    await client
      .query(
        `
          UPDATE auth_sessions
          SET revoked_at = NOW(), revoke_reason = 'CAPACITY_TEST_FINISHED'
          WHERE id = $1 AND revoked_at IS NULL
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
  await rm(exportStorageDirectory, { force: true, recursive: true }).catch(() => undefined);
}
