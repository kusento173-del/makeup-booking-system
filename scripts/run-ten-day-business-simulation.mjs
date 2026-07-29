import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { config } from 'dotenv';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
config({ path: resolve(root, '.env'), quiet: true });

const sourceUrl = new URL(requiredEnvironment('DATABASE_URL'));
const sourceDatabaseName =
  process.env.SIMULATION_SOURCE_DATABASE || 'makeup_booking_staging_20260727';
const simulationDatabaseName =
  process.env.SIMULATION_DATABASE_NAME || 'makeup_booking_simulation_10d';
const simulationUrl = new URL(sourceUrl);
simulationUrl.pathname = `/${simulationDatabaseName}`;
simulationUrl.searchParams.delete('schema');
const redisUrl = new URL(requiredEnvironment('REDIS_URL'));
redisUrl.pathname = '/2';
const workerToken = requiredEnvironment('INTERNAL_WORKER_TOKEN');
const firstBusinessDate = process.env.SIMULATION_START_DATE || '2026-07-29';
const appointmentDays = 10;
const exportDirectory = resolve(root, 'tmp', 'ten-day-simulation-exports');
const clockModule = pathToFileURL(resolve(root, 'scripts', 'simulated-clock-register.mjs')).href;
const requireDatabase = createRequire(resolve(root, 'packages/database/package.json'));
const requireApi = createRequire(resolve(root, 'apps/api/package.json'));
const { Client } = requireDatabase('pg');
const { AccessTokenService } = requireApi('./dist/auth/access-token.service.js');
const accessTokens = new AccessTokenService();
const dailyTargets = new Map([
  ['SONGJIANG', { fixed: 225, single: 225 }],
  ['XIANCHANG', { fixed: 150, single: 150 }],
]);
const metrics = { requests: [], unexpectedConflicts: 0 };

let api;
let apiPort;
let baseUrl;
let client;
let fixtures;
let identities;

assertSafeDatabaseName(sourceDatabaseName);
assertSafeDatabaseName(simulationDatabaseName);
if (sourceDatabaseName === simulationDatabaseName) {
  throw new Error('Simulation source and target databases must be different');
}
if (Buffer.byteLength(workerToken) < 32) {
  throw new Error('INTERNAL_WORKER_TOKEN must contain at least 32 bytes');
}

function requiredEnvironment(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function assertSafeDatabaseName(value) {
  if (!/^makeup_booking_[a-z0-9_]+$/.test(value)) {
    throw new Error(`Unsafe simulation database name: ${value}`);
  }
}

function run(command, arguments_, options = {}) {
  const result = spawnSync(command, arguments_, {
    cwd: root,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    stdio: 'inherit',
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${arguments_.join(' ')} failed with exit code ${result.status}`);
  }
}

function runDockerShell(service, script) {
  const result = spawnSync('docker', ['compose', 'exec', '-T', service, 'sh', '-ec', script], {
    cwd: root,
    encoding: 'utf8',
    shell: false,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${service} command failed (${result.status})`);
}

function addDays(date, days) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function simulatedNow(date) {
  return new Date(`${date}T12:30:00.000Z`);
}

function isoWeekday(date) {
  const value = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  return value === 0 ? 7 : value;
}

function sleep(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

function percentile(values, ratio) {
  if (values.length === 0) return 0;
  const sorted = values.toSorted((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)];
}

async function findFreePort() {
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

async function query(text, values = []) {
  return (await client.query(text, values)).rows;
}

async function cloneDatabase() {
  const cloneScript = [
    `dropdb --if-exists --force -U "$POSTGRES_USER" ${simulationDatabaseName}`,
    `createdb -U "$POSTGRES_USER" ${simulationDatabaseName}`,
    `pg_dump -U "$POSTGRES_USER" --no-owner --no-privileges ${sourceDatabaseName} | psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" ${simulationDatabaseName}`,
  ].join('\n');
  console.log(`[simulation] cloning ${sourceDatabaseName} -> ${simulationDatabaseName}`);
  runDockerShell('postgres', cloneScript);
  run('pnpm', ['db:migrate'], {
    env: { ...process.env, DATABASE_URL: simulationUrl.toString() },
  });
}

async function resetOperationalData() {
  const operationalTables = new Set([
    'appointments',
    'artist_overtimes',
    'artist_shift_change_requests',
    'artist_shift_templates',
    'artist_unavailable_periods',
    'auth_password_change_challenges',
    'auth_role_selection_challenges',
    'auth_sessions',
    'export_jobs',
    'fixed_appointment_requests',
    'fixed_appointment_rules',
    'fixed_appointment_rule_weekdays',
    'idempotency_records',
    'leave_records',
    'operation_logs',
    'outbox_events',
  ]);
  const tables = await query(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
  );
  const present = tables
    .map(({ tablename }) => tablename)
    .filter((table) => operationalTables.has(table));
  if (present.length === 0) throw new Error('No operational tables were found in the clone');
  await client.query(
    `TRUNCATE TABLE ${present.map((table) => `"${table}"`).join(', ')} RESTART IDENTITY CASCADE`,
  );
  await client.query(
    `UPDATE artist_profiles SET initial_shift_configured_at = NULL, updated_at = NOW()`,
  );
  runDockerShell(
    'redis',
    'redis-cli --no-auth-warning -a "$REDIS_PASSWORD" -n 2 FLUSHDB >/dev/null',
  );
}

async function loadFixtures() {
  const sites = await query(`
    SELECT id, code, name
    FROM sites
    WHERE status = 'ACTIVE' AND code IN ('SONGJIANG', 'XIANCHANG')
    ORDER BY code
  `);
  const artists = await query(`
    SELECT a.id, a.nickname, a.site_id, a.user_id, r.id AS role_id
    FROM artist_profiles a
    JOIN app_users u ON u.id = a.user_id AND u.status = 'ACTIVE'
    JOIN user_roles r ON r.user_id = u.id AND r.role_code = 'ARTIST' AND r.revoked_at IS NULL
    WHERE a.employment_status = 'ACTIVE' AND a.deleted_at IS NULL
    ORDER BY a.site_id, a.nickname, a.id
  `);
  const operators = await query(`
    SELECT o.id, o.real_name, o.site_id, o.user_id, r.id AS role_id
    FROM operator_profiles o
    JOIN app_users u ON u.id = o.user_id AND u.status = 'ACTIVE'
    JOIN user_roles r ON r.user_id = u.id AND r.role_code = 'OPERATOR' AND r.revoked_at IS NULL
    WHERE o.employment_status = 'ACTIVE' AND o.deleted_at IS NULL
    ORDER BY o.site_id, o.real_name, o.id
  `);
  const hosts = await query(
    `
      SELECT
        h.host_code,
        h.id,
        h.nickname,
        h.real_name,
        h.row_version,
        h.site_id,
        h.user_id,
        r.id AS role_id,
        relation.operator_id
      FROM host_profiles h
      JOIN app_users u ON u.id = h.user_id AND u.status = 'ACTIVE'
      JOIN user_roles r ON r.user_id = u.id AND r.role_code = 'HOST' AND r.revoked_at IS NULL
      LEFT JOIN LATERAL (
        SELECT relation.operator_id
        FROM host_operator_relations relation
        WHERE relation.host_id = h.id
          AND relation.valid_from <= $1::date
          AND (relation.valid_until IS NULL OR relation.valid_until > $2::date)
        ORDER BY relation.valid_from DESC, relation.id DESC
        LIMIT 1
      ) relation ON TRUE
      WHERE h.qualification_status = 'ACTIVE' AND h.deleted_at IS NULL
      ORDER BY h.site_id, h.host_code, h.id
    `,
    [addDays(firstBusinessDate, 1), addDays(firstBusinessDate, appointmentDays)],
  );
  const [admin] = await query(`
    SELECT u.id AS user_id, r.id AS role_id
    FROM app_users u
    JOIN user_roles r ON r.user_id = u.id
    WHERE u.status = 'ACTIVE' AND r.role_code = 'ADMIN' AND r.revoked_at IS NULL
    ORDER BY r.created_at
    LIMIT 1
  `);
  const customerServices = await query(`
    SELECT u.id AS user_id, r.id AS role_id, r.site_id
    FROM app_users u
    JOIN user_roles r ON r.user_id = u.id
    WHERE u.status = 'ACTIVE'
      AND r.role_code = 'CUSTOMER_SERVICE'
      AND r.revoked_at IS NULL
    ORDER BY r.site_id, r.created_at
  `);
  if (!admin || sites.length !== 2) throw new Error('Required administrator or sites are missing');

  const bySite = new Map();
  for (const site of sites) {
    const target = dailyTargets.get(site.code);
    const siteArtists = artists.filter((item) => item.site_id === site.id);
    const siteOperators = operators.filter((item) => item.site_id === site.id);
    const siteHosts = hosts.filter((item) => item.site_id === site.id && item.operator_id);
    const requiredHosts = target.fixed + target.single + 80;
    if (siteArtists.length < 2 || siteOperators.length < 1 || siteHosts.length < requiredHosts) {
      throw new Error(
        `${site.code} fixtures insufficient: artists=${siteArtists.length}, operators=${siteOperators.length}, hosts=${siteHosts.length}, requiredHosts=${requiredHosts}`,
      );
    }
    bySite.set(site.code, {
      artists: siteArtists,
      fixedHosts: siteHosts.slice(0, target.fixed),
      operators: siteOperators,
      singleHosts: siteHosts.slice(target.fixed, target.fixed + target.single),
      site,
      spareHosts: siteHosts.slice(target.fixed + target.single),
      target,
    });
  }
  return { admin, bySite, customerServices, hosts, operators, artists, sites };
}

async function createSessions() {
  const actors = [
    { ...fixtures.admin, role_code: 'ADMIN', site_id: null },
    ...fixtures.customerServices.map((item) => ({
      ...item,
      role_code: 'CUSTOMER_SERVICE',
    })),
    ...fixtures.artists.map((item) => ({ ...item, role_code: 'ARTIST' })),
    ...fixtures.operators.map((item) => ({ ...item, role_code: 'OPERATOR' })),
    ...fixtures.hosts.map((item) => ({ ...item, role_code: 'HOST' })),
  ];
  const uniqueActors = new Map(actors.map((actor) => [`${actor.user_id}:${actor.role_id}`, actor]));
  const result = new Map();
  for (const actor of uniqueActors.values()) {
    result.set(`${actor.role_code}:${actor.user_id}`, await createSession(actor));
  }
  return result;
}

async function createSession(actor) {
  const hash = createHash('sha256').update(randomBytes(64)).digest('hex');
  const [session] = await query(
    `
      INSERT INTO auth_sessions (user_id, role_assignment_id, refresh_token_hash, expires_at)
      VALUES ($1, $2, $3, $4::timestamptz)
      RETURNING id
    `,
    [actor.user_id, actor.role_id, hash, `${addDays(firstBusinessDate, 40)}T00:00:00Z`],
  );
  return { ...actor, session_id: session.id };
}

async function renewIdentity(roleCode, userId) {
  const key = `${roleCode}:${userId}`;
  const current = identities.get(key);
  if (!current) throw new Error(`Missing identity to renew: ${key}`);
  identities.set(key, await createSession(current));
}

async function token(roleCode, userId, now) {
  const identity = identities.get(`${roleCode}:${userId}`);
  if (!identity) throw new Error(`Missing ${roleCode} identity for ${userId}`);
  return (
    await accessTokens.issue(
      identity.user_id,
      identity.session_id,
      {
        roleAssignmentId: identity.role_id,
        roleCode,
        siteId: identity.site_id ?? null,
      },
      now,
    )
  ).token;
}

async function request(
  path,
  { body, expected = [200], headers = {}, method = 'GET', token: bearer } = {},
) {
  const startedAt = performance.now();
  const response = await fetch(`${baseUrl}${path}`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...headers,
    },
    method,
  });
  const text = await response.text();
  metrics.requests.push(performance.now() - startedAt);
  if (!expected.includes(response.status)) {
    throw new Error(`${method} ${path} returned HTTP ${response.status}: ${text.slice(0, 500)}`);
  }
  return text ? JSON.parse(text) : null;
}

async function mapConcurrent(items, concurrency, operation) {
  let cursor = 0;
  const results = new Array(items.length);
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (cursor < items.length) {
        const index = cursor;
        cursor += 1;
        results[index] = await operation(items[index], index);
      }
    }),
  );
  return results;
}

async function startApi(date) {
  await stopApi();
  apiPort = await findFreePort();
  baseUrl = `http://127.0.0.1:${apiPort}`;
  api = spawn(process.execPath, ['apps/api/dist/main.js'], {
    cwd: root,
    env: {
      ...process.env,
      API_PORT: String(apiPort),
      DATABASE_URL: simulationUrl.toString(),
      EXPORT_STORAGE_DIR: exportDirectory,
      NODE_ENV: 'test',
      NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --import=${clockModule}`.trim(),
      REDIS_URL: redisUrl.toString(),
      SIMULATED_NOW: simulatedNow(date).toISOString(),
    },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (api.exitCode !== null) throw new Error(`Simulation API exited (${api.exitCode})`);
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return;
    } catch {
      // The isolated API can need several seconds to open its first connection.
    }
    await sleep(250);
  }
  throw new Error('Simulation API did not become healthy');
}

async function stopApi() {
  if (!api || api.exitCode !== null) {
    api = undefined;
    return;
  }
  api.kill('SIGTERM');
  for (let attempt = 0; attempt < 40 && api.exitCode === null; attempt += 1) await sleep(100);
  if (api.exitCode === null) api.kill('SIGKILL');
  api = undefined;
}

function slotMinutes() {
  return [
    ...Array.from({ length: 12 }, (_, index) => 360 + index * 30),
    ...Array.from({ length: 18 }, (_, index) => 780 + index * 30),
  ];
}

function allocation(items, artists, slotOffset) {
  const slots = slotMinutes();
  return items.map((item, index) => ({
    artist: artists[index % artists.length],
    host: item,
    startMinute: slots[slotOffset + Math.floor(index / artists.length)],
  }));
}

async function configureInitialShifts(now) {
  const adminToken = await token('ADMIN', fixtures.admin.user_id, now);
  await mapConcurrent(fixtures.artists, 16, async (artist) => {
    await request(`/artists/${artist.id}/shifts/initial`, {
      body: {
        breakEndMinute: 780,
        breakStartMinute: 720,
        workEndMinute: 1320,
        workStartMinute: 360,
        workdays: [1, 2, 3, 4, 5, 6, 7],
      },
      expected: [201],
      method: 'POST',
      token: adminToken,
    });
  });
  console.log(`[simulation] configured shifts for ${fixtures.artists.length} artists`);
}

async function createFixedRules(now, effectiveFrom) {
  const adminToken = await token('ADMIN', fixtures.admin.user_id, now);
  for (const site of fixtures.bySite.values()) {
    const assignments = allocation(site.fixedHosts, site.artists, 0);
    const results = await mapConcurrent(assignments, 12, async ({ artist, host, startMinute }) =>
      request('/fixed-appointments/rules/direct', {
        body: {
          artistId: artist.id,
          durationMinutes: 30,
          effectiveFrom,
          hostId: host.id,
          reason: '十日仿真固定预约',
          requestType: 'CREATE',
          startMinute,
          weekdays: [1, 2, 3, 4, 5, 6, 7],
        },
        method: 'POST',
        token: adminToken,
      }),
    );
    assignments.forEach((assignment, index) => {
      assignment.fixedRuleId = results[index].fixedRuleId;
    });
    site.fixedAssignments = assignments;
  }
  console.log('[simulation] created 375 fixed relationships through the real approval path');
}

async function generateFixedAppointments() {
  await request('/internal/jobs/fixed-generation', {
    headers: { 'X-Worker-Token': workerToken },
    method: 'POST',
  });
}

async function actorTokenForHost(host, now, preferOperator) {
  if (preferOperator && host.operator_id) {
    const operator = fixtures.operators.find((item) => item.id === host.operator_id);
    if (operator) return token('OPERATOR', operator.user_id, now);
  }
  return token('HOST', host.user_id, now);
}

async function createAppointment(assignment, date, now, options = {}) {
  const bearer = await actorTokenForHost(assignment.host, now, options.preferOperator ?? false);
  return request('/appointments', {
    body: {
      artistId: assignment.artist.id,
      confirmedSecondBooking: options.confirmedSecondBooking ?? false,
      date,
      durationMinutes: 30,
      hostId: assignment.host.id,
      reason: options.reason ?? '十日真实场景仿真',
      startMinute: assignment.startMinute,
    },
    expected: options.expected ?? [201],
    headers: { 'Idempotency-Key': randomUUID() },
    method: 'POST',
    token: bearer,
  });
}

async function cancelAppointment(appointment, host, now, reason) {
  const bearer = await actorTokenForHost(host, now, false);
  return request(`/appointments/${appointment.id}/cancel`, {
    body: { expectedRowVersion: appointment.rowVersion, reason },
    method: 'POST',
    token: bearer,
  });
}

async function simulateDay(dayIndex, businessDate) {
  const now = simulatedNow(businessDate);
  const date = addDays(businessDate, 1);
  await startApi(businessDate);
  await generateFixedAppointments();

  const dailySingles = [];
  for (const site of fixtures.bySite.values()) {
    const assignments = allocation(site.singleHosts, site.artists, 10);
    const created = await mapConcurrent(assignments, 32, (assignment, index) =>
      createAppointment(assignment, date, now, { preferOperator: index % 2 === 1 }),
    );
    assignments.forEach((assignment, index) => {
      dailySingles.push({ assignment, appointment: created[index].appointment, site });
    });
  }

  const rescheduleCandidates = dailySingles.slice(30, 50);
  await mapConcurrent(rescheduleCandidates, 10, async ({ assignment, appointment }, index) => {
    const bearer = await actorTokenForHost(assignment.host, now, index % 2 === 0);
    await request(`/appointments/${appointment.id}/reschedule`, {
      body: {
        artistId: assignment.artist.id,
        confirmedSecondBooking: false,
        date,
        durationMinutes: 30,
        expectedRowVersion: appointment.rowVersion,
        reason: '模拟临时改期',
        startMinute: slotMinutes()[22],
      },
      expected: [201],
      headers: { 'Idempotency-Key': randomUUID() },
      method: 'POST',
      token: bearer,
    });
  });

  const cancelledSingles = dailySingles.slice(0, 20);
  await mapConcurrent(cancelledSingles, 10, ({ assignment, appointment }) =>
    cancelAppointment(appointment, assignment.host, now, '模拟临时取消'),
  );
  await mapConcurrent(cancelledSingles, 10, ({ assignment, site }, index) => {
    const replacement = site.spareHosts[(dayIndex * 30 + index) % site.spareHosts.length];
    return createAppointment({ ...assignment, host: replacement }, date, now, {
      preferOperator: true,
      reason: '模拟取消后档期释放并重新预约',
    });
  });

  const secondBookings = [];
  for (const site of fixtures.bySite.values()) {
    for (let index = 0; index < 5; index += 1) {
      secondBookings.push({
        artist: site.artists[(dayIndex * 5 + index) % site.artists.length],
        host: site.singleHosts[index],
        startMinute: slotMinutes()[26 + (index % 3)],
      });
    }
  }
  await mapConcurrent(secondBookings, 10, (assignment) =>
    createAppointment(assignment, date, now, {
      confirmedSecondBooking: true,
      preferOperator: false,
      reason: '模拟主播当日第二次预约',
    }),
  );

  const fixedAppointments = await query(
    `
      SELECT a.id, a.host_id, a.row_version
      FROM appointments a
      WHERE a.appointment_date = $1::date
        AND a.appointment_type = 'FIXED'
        AND a.status = 'BOOKED'
      ORDER BY a.site_id, a.start_at, a.id
      LIMIT 5
    `,
    [date],
  );
  await mapConcurrent(fixedAppointments, 5, async (appointment, index) => {
    const host = fixtures.hosts.find((item) => item.id === appointment.host_id);
    await cancelAppointment(appointment, host, now, '模拟固定预约当日取消');
    const [source] = await query(
      `SELECT artist_id, extract(hour FROM start_at AT TIME ZONE 'Asia/Shanghai')::int * 60
        + extract(minute FROM start_at AT TIME ZONE 'Asia/Shanghai')::int AS start_minute
       FROM appointments WHERE id = $1`,
      [appointment.id],
    );
    const site = [...fixtures.bySite.values()].find((item) => item.site.id === host.site_id);
    const replacement = site.spareHosts[(dayIndex * 40 + index + 25) % site.spareHosts.length];
    const artist = site.artists.find((item) => item.id === source.artist_id);
    await createAppointment(
      { artist, host: replacement, startMinute: Number(source.start_minute) },
      date,
      now,
      { preferOperator: true, reason: '模拟固定取消后档期复用' },
    );
  });

  if (dayIndex === 1) await simulateUnavailablePeriod(date, now);
  if (dayIndex === 2) await simulateArtistLeave(date, now);
  if (dayIndex === 3) await simulateOperatorFixedRequest(date, now);
  if (dayIndex === 4) await simulateSameSlotRace(date, now);

  const [summary] = await query(
    `
      SELECT
        COUNT(*) FILTER (WHERE status IN ('BOOKED', 'COMPLETED'))::int AS active_total,
        COUNT(*) FILTER (
          WHERE status IN ('BOOKED', 'COMPLETED') AND appointment_type = 'FIXED'
        )::int AS fixed_total,
        COUNT(*) FILTER (WHERE status = 'CANCELLED')::int AS cancelled_total
      FROM appointments
      WHERE appointment_date = $1::date
    `,
    [date],
  );
  if (summary.active_total < 700 || summary.active_total > 800) {
    throw new Error(`${date} active volume ${summary.active_total} is outside 700-800`);
  }
  const fixedRatio = summary.fixed_total / summary.active_total;
  if (fixedRatio < 0.45 || fixedRatio > 0.55) {
    throw new Error(`${date} fixed ratio ${(fixedRatio * 100).toFixed(1)}% is outside 45%-55%`);
  }
  console.log(
    `[simulation] day ${dayIndex + 1}/10 ${date}: active=${summary.active_total}, fixed=${summary.fixed_total}, cancelled=${summary.cancelled_total}`,
  );
}

async function simulateUnavailablePeriod(date, now) {
  const site = fixtures.bySite.get('SONGJIANG');
  const artist = site.artists.at(-1);
  const adminToken = await token('ADMIN', fixtures.admin.user_id, now);
  const range = {
    artistId: artist.id,
    endMinute: 1320,
    startMinute: 1290,
    unavailableDate: date,
  };
  const preview = await request('/artist-unavailable-periods/preview', {
    body: range,
    method: 'POST',
    token: adminToken,
  });
  const period = await request('/artist-unavailable-periods', {
    body: {
      ...range,
      confirmedAffectedAppointmentCount: preview.affectedAppointmentCount,
      reason: '模拟化妆师临时上课',
    },
    expected: [201],
    method: 'POST',
    token: adminToken,
  });
  await request(`/artist-unavailable-periods/${period.id}/cancel`, {
    body: { expectedRowVersion: period.rowVersion, reason: '模拟课程取消' },
    expected: [204],
    method: 'POST',
    token: adminToken,
  });
}

async function simulateArtistLeave(date, now) {
  const site = fixtures.bySite.get('XIANCHANG');
  const artist = site.artists.at(-1);
  const artistToken = await token('ARTIST', artist.user_id, now);
  const preview = await request('/leaves/preview', {
    body: { endDate: date, startDate: date },
    method: 'POST',
    token: artistToken,
  });
  const leave = await request('/leaves', {
    body: {
      confirmedAffectedAppointmentCount: preview.affectedAppointmentCount,
      endDate: date,
      reason: '模拟化妆师临时请假',
      startDate: date,
    },
    expected: [201],
    method: 'POST',
    token: artistToken,
  });
  await request(`/leaves/${leave.id}/cancel`, {
    body: { expectedRowVersion: leave.rowVersion, reason: '模拟请假撤销' },
    expected: [204],
    method: 'POST',
    token: artistToken,
  });
}

async function simulateOperatorFixedRequest(date, now) {
  const site = fixtures.bySite.get('SONGJIANG');
  const host = site.spareHosts.at(-1);
  const operator = fixtures.operators.find((item) => item.id === host.operator_id);
  const operatorToken = await token('OPERATOR', operator.user_id, now);
  const adminToken = await token('ADMIN', fixtures.admin.user_id, now);
  const created = await request('/fixed-appointments/requests', {
    body: {
      artistId: site.artists.at(-1).id,
      durationMinutes: 30,
      effectiveFrom: addDays(date, 1),
      hostId: host.id,
      reason: '模拟运营申请固定',
      startMinute: 1260,
      weekdays: [isoWeekday(addDays(date, 1))],
    },
    expected: [201],
    headers: { 'Idempotency-Key': randomUUID() },
    method: 'POST',
    token: operatorToken,
  });
  await request(`/fixed-appointments/requests/${created.request.id}/review`, {
    body: {
      comment: '模拟客服审核通过',
      decision: 'APPROVE',
      expectedRowVersion: created.request.rowVersion,
    },
    method: 'POST',
    token: adminToken,
  });
}

async function simulateSameSlotRace(date, now) {
  const site = fixtures.bySite.get('SONGJIANG');
  const artist = site.artists.at(-2);
  const hosts = site.spareHosts.slice(-20);
  const responses = await Promise.all(
    hosts.map(async (host) => {
      try {
        await createAppointment({ artist, host, startMinute: 1290 }, date, now, {
          preferOperator: true,
          reason: '模拟多人抢同一档期',
        });
        return 201;
      } catch (error) {
        if (error instanceof Error && error.message.includes('HTTP 409')) return 409;
        throw error;
      }
    }),
  );
  const created = responses.filter((status) => status === 201).length;
  const conflicts = responses.filter((status) => status === 409).length;
  if (created !== 1 || conflicts !== hosts.length - 1) {
    throw new Error(`Same-slot race failed: created=${created}, conflicts=${conflicts}`);
  }
}

async function simulatePasswordFlows(now) {
  const adminToken = await token('ADMIN', fixtures.admin.user_id, now);
  const representatives = [
    ['HOST', fixtures.bySite.get('SONGJIANG').spareHosts.at(-2)],
    ['OPERATOR', fixtures.bySite.get('SONGJIANG').operators.at(-1)],
    ['ARTIST', fixtures.bySite.get('SONGJIANG').artists.at(-1)],
  ];
  for (const [roleCode, profile] of representatives) {
    const login = await query(
      `
        SELECT identity.external_subject AS login_name
        FROM user_identities identity
        WHERE identity.user_id = $1
          AND identity.provider = 'PASSWORD'
          AND identity.provider_app_id = 'BACKOFFICE'
          AND identity.status = 'ACTIVE'
        LIMIT 1
      `,
      [profile.user_id],
    );
    if (!login[0]) throw new Error(`${roleCode} representative has no password identity`);
    await request('/backoffice/profile-accounts/password-reset', {
      body: {
        profileId: profile.id,
        reason: '十日仿真首次登录',
        roleCode,
        temporaryPassword: '111111111111',
      },
      expected: [204],
      method: 'POST',
      token: adminToken,
    });
    const firstLogin = await request('/auth/password/login', {
      body: { loginName: login[0].login_name, password: '111111111111' },
      method: 'POST',
    });
    if (firstLogin.kind !== 'PASSWORD_CHANGE_REQUIRED') {
      throw new Error(`${roleCode} initial login did not require a password change`);
    }
    const nextPassword = `Simulation-${roleCode}-2026!`;
    const completion = await request('/auth/password/complete', {
      body: {
        newPassword: nextPassword,
        passwordChangeChallenge: firstLogin.passwordChangeChallenge,
      },
      method: 'POST',
    });
    if (completion.kind !== 'SESSION_CREATED') {
      throw new Error(`${roleCode} password completion did not create a session`);
    }
    await request('/auth/profile', { token: completion.session.accessToken });
    await request('/auth/logout', {
      expected: [204],
      method: 'POST',
      token: completion.session.accessToken,
    });
    const loginAgain = await request('/auth/password/login', {
      body: { loginName: login[0].login_name, password: nextPassword },
      method: 'POST',
    });
    if (loginAgain.kind !== 'SESSION_CREATED') {
      throw new Error(`${roleCode} could not log in with the changed password`);
    }
    await renewIdentity(roleCode, profile.user_id);
  }
  console.log('[simulation] host/operator/artist initial login and password change passed');
}

async function simulatePersonnelMaintenance(now) {
  const adminToken = await token('ADMIN', fixtures.admin.user_id, now);
  const site = fixtures.bySite.get('SONGJIANG');
  const host = site.spareHosts.at(-5);
  const originalCode = host.host_code;
  const changedCode = `SIM${originalCode}`.slice(0, 32);
  await request(`/master-data/hosts/${host.id}`, {
    body: {
      expectedRowVersion: host.row_version,
      hostCode: changedCode,
      nickname: host.nickname ?? undefined,
      qualificationStatus: 'ACTIVE',
      realName: host.real_name,
      reason: '模拟更正主播编号',
      siteId: host.site_id,
    },
    expected: [204],
    method: 'PATCH',
    token: adminToken,
  });
  const [changed] = await query(`SELECT host_code, row_version FROM host_profiles WHERE id = $1`, [
    host.id,
  ]);
  if (changed.host_code !== changedCode) throw new Error('Host code update was not persisted');

  const createdAccount = await request('/backoffice/accounts', {
    body: {
      displayName: '十日仿真客服',
      loginName: 'simulation-customer-service',
      password: '111111111111',
      roleCode: 'CUSTOMER_SERVICE',
      siteId: site.site.id,
    },
    expected: [201],
    method: 'POST',
    token: adminToken,
  });
  const [account] = await query(`SELECT row_version FROM app_users WHERE id = $1`, [
    createdAccount.id,
  ]);
  await request(`/backoffice/accounts/${createdAccount.id}/delete`, {
    body: { expectedRowVersion: account.row_version, reason: '模拟删除测试客服' },
    expected: [204],
    method: 'POST',
    token: adminToken,
  });

  const deleteHost = site.spareHosts.at(-6);
  const deletedHostOriginalCode = deleteHost.host_code;
  await request(`/master-data/hosts/${deleteHost.id}/delete`, {
    body: { expectedRowVersion: deleteHost.row_version, reason: '模拟人员离职删除' },
    expected: [204],
    method: 'POST',
    token: adminToken,
  });
  const [deleted] = await query(
    `SELECT deleted_at IS NOT NULL AS deleted, host_code FROM host_profiles WHERE id = $1`,
    [deleteHost.id],
  );
  if (!deleted.deleted) throw new Error('Deleted host remained active');
  await request('/master-data/hosts', {
    body: {
      hostCode: deletedHostOriginalCode,
      realName: '仿真重新入职主播',
      siteId: site.site.id,
    },
    expected: [201],
    method: 'POST',
    token: adminToken,
  });
  console.log('[simulation] host code change, account deletion and re-creation passed');
}

async function assertConsistency() {
  const [result] = await query(`
    SELECT
      (
        SELECT COUNT(*)
        FROM appointments left_item
        JOIN appointments right_item
          ON left_item.artist_id = right_item.artist_id
         AND left_item.appointment_date = right_item.appointment_date
         AND left_item.id < right_item.id
         AND left_item.status IN ('BOOKED', 'COMPLETED')
         AND right_item.status IN ('BOOKED', 'COMPLETED')
         AND left_item.start_at < right_item.end_at
         AND right_item.start_at < left_item.end_at
      )::int AS artist_overlaps,
      (
        SELECT COUNT(*)
        FROM appointments left_item
        JOIN appointments right_item
          ON left_item.host_id = right_item.host_id
         AND left_item.appointment_date = right_item.appointment_date
         AND left_item.id < right_item.id
         AND left_item.status IN ('BOOKED', 'COMPLETED')
         AND right_item.status IN ('BOOKED', 'COMPLETED')
         AND left_item.start_at < right_item.end_at
         AND right_item.start_at < left_item.end_at
      )::int AS host_overlaps,
      (
        SELECT COUNT(*)
        FROM (
          SELECT host_id, appointment_date
          FROM appointments
          WHERE status IN ('BOOKED', 'COMPLETED')
          GROUP BY host_id, appointment_date
          HAVING COUNT(*) > 2
        ) invalid_days
      )::int AS host_daily_limit_violations,
      (
        SELECT COUNT(*)
        FROM (
          SELECT fixed_rule_id, appointment_date
          FROM appointments
          WHERE fixed_rule_id IS NOT NULL AND status IN ('BOOKED', 'COMPLETED')
          GROUP BY fixed_rule_id, appointment_date
          HAVING COUNT(*) > 1
        ) duplicate_fixed_days
  `);
  const failures = Object.entries(result).filter(([, value]) => Number(value) !== 0);
  if (failures.length > 0) {
    throw new Error(`Consistency checks failed: ${JSON.stringify(result)}`);
  }
  const days = await query(
    `
    SELECT
      appointment_date::text AS date,
      COUNT(*) FILTER (WHERE status IN ('BOOKED', 'COMPLETED'))::int AS active,
      COUNT(*) FILTER (
        WHERE status IN ('BOOKED', 'COMPLETED') AND appointment_type = 'FIXED'
      )::int AS fixed
    FROM appointments
    GROUP BY appointment_date
    HAVING appointment_date BETWEEN $1::date AND $2::date
    ORDER BY appointment_date
  `,
    [addDays(firstBusinessDate, 1), addDays(firstBusinessDate, appointmentDays)],
  );
  if (days.length !== appointmentDays)
    throw new Error(`Expected 10 appointment days, found ${days.length}`);
  return { days, result };
}

try {
  console.log('[simulation] building current API and database packages');
  run('pnpm', ['--filter', '@makeup/database', 'build']);
  run('pnpm', ['--filter', '@makeup/api', 'build']);
  await cloneDatabase();
  client = new Client({ connectionString: simulationUrl.toString() });
  await client.connect();
  await resetOperationalData();
  fixtures = await loadFixtures();
  identities = await createSessions();

  await startApi(firstBusinessDate);
  const firstNow = simulatedNow(firstBusinessDate);
  await simulatePasswordFlows(firstNow);
  await configureInitialShifts(firstNow);
  await createFixedRules(firstNow, addDays(firstBusinessDate, 1));

  for (let dayIndex = 0; dayIndex < appointmentDays; dayIndex += 1) {
    await simulateDay(dayIndex, addDays(firstBusinessDate, dayIndex));
  }

  await startApi(addDays(firstBusinessDate, appointmentDays - 1));
  await simulatePersonnelMaintenance(simulatedNow(addDays(firstBusinessDate, appointmentDays - 1)));
  const consistency = await assertConsistency();
  const p95 = percentile(metrics.requests, 0.95);
  if (p95 >= 2_000) throw new Error(`Request p95 ${p95.toFixed(0)}ms exceeded 2000ms`);
  console.log(
    JSON.stringify(
      {
        appointmentDays: consistency.days,
        consistency: consistency.result,
        database: simulationDatabaseName,
        p95Milliseconds: Number(p95.toFixed(1)),
        requests: metrics.requests.length,
        status: 'PASSED',
      },
      null,
      2,
    ),
  );
} finally {
  await stopApi();
  if (client) await client.end();
  await rm(exportDirectory, { force: true, recursive: true });
}
