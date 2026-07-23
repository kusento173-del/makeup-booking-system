import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import pg from 'pg';

const { Client, Pool } = pg;
const root = fileURLToPath(new URL('../../../', import.meta.url));
const baseUrl = new URL(
  process.env.DATABASE_URL ??
    'postgresql://makeup:makeup_local@127.0.0.1:5432/makeup_booking?schema=public',
);
const databaseName = `makeup_booking_concurrency_${process.pid}_${Date.now()}`.slice(0, 63);
const adminUrl = new URL(baseUrl);
adminUrl.pathname = '/postgres';
adminUrl.search = '';
const testUrl = new URL(baseUrl);
testUrl.pathname = `/${databaseName}`;
testUrl.search = '';
const admin = new Client({ connectionString: adminUrl.toString() });
let pool;
let adminConnected = false;
let databaseCreated = false;

function quotedIdentifier(value) {
  if (!/^[a-z0-9_]+$/.test(value)) throw new Error('Unsafe temporary database name');
  return `"${value}"`;
}

function migrate() {
  const prismaCli = fileURLToPath(
    new URL('../../../node_modules/prisma/build/index.js', import.meta.url),
  );
  const result = spawnSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, DATABASE_URL: testUrl.toString() },
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || result.stdout.trim() || 'Temporary migration failed');
  }
}

async function expectResults(results, successes, allowedErrorCodes, label) {
  const fulfilled = results.filter((result) => result.status === 'fulfilled');
  const rejected = results.filter((result) => result.status === 'rejected');
  if (fulfilled.length !== successes) {
    throw new Error(`${label}: expected ${successes} successes, got ${fulfilled.length}`);
  }
  for (const result of rejected) {
    const code =
      result.reason instanceof Error && 'code' in result.reason ? result.reason.code : '';
    if (!allowedErrorCodes.includes(String(code))) {
      throw new Error(`${label}: unexpected database error ${String(code)}`);
    }
  }
  return fulfilled;
}

async function seed() {
  const suffix = `${process.pid}${Date.now()}`.slice(-12);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const site = await client.query(`SELECT id, name FROM sites WHERE code = 'SONGJIANG'`);
    const user = await client.query(
      `INSERT INTO app_users (display_name) VALUES ($1) RETURNING id`,
      [`并发验收-${suffix}`],
    );
    const hosts = await client.query(
      `INSERT INTO host_profiles (host_code, real_name, site_id)
       SELECT 'CC-' || $1 || '-' || value, '并发主播' || value, $2
       FROM generate_series(1, 100) AS value
       RETURNING id, host_code, real_name`,
      [suffix, site.rows[0].id],
    );
    const artists = await client.query(
      `INSERT INTO artist_profiles (real_name, nickname, nickname_normalized, site_id)
       SELECT '并发化妆师' || value, '并发妆-' || $1 || '-' || value,
              'concurrency-' || $1 || '-' || value, $2
       FROM generate_series(1, 101) AS value
       RETURNING id, nickname`,
      [suffix, site.rows[0].id],
    );
    await client.query('COMMIT');
    return {
      artists: artists.rows,
      hosts: hosts.rows,
      site: site.rows[0],
      userId: user.rows[0].id,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

function insertAppointment({
  artist,
  appointmentDate,
  dailySequence,
  endAt,
  host,
  site,
  startAt,
  userId,
}) {
  return pool.query(
    `INSERT INTO appointments (
       host_id, host_code_snapshot, host_name_snapshot,
       artist_id, artist_nickname_snapshot, site_id, site_name_snapshot,
       appointment_date, start_at, end_at, duration_minutes, daily_sequence,
       created_by_user_id, created_by_role
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 15, $11, $12, 'HOST')
     RETURNING id`,
    [
      host.id,
      host.host_code,
      host.real_name,
      artist.id,
      artist.nickname,
      site.id,
      site.name,
      appointmentDate,
      startAt,
      endAt,
      dailySequence,
      userId,
    ],
  );
}

async function runChecks() {
  const data = await seed();
  const sharedArtist = data.artists[0];
  const sameStart = new Date('2026-08-03T01:00:00.000Z');
  const sameEnd = new Date('2026-08-03T01:15:00.000Z');
  const slotResults = await Promise.allSettled(
    data.hosts.map((host) =>
      insertAppointment({
        artist: sharedArtist,
        appointmentDate: '2026-08-03',
        dailySequence: 1,
        endAt: sameEnd,
        host,
        site: data.site,
        startAt: sameStart,
        userId: data.userId,
      }),
    ),
  );
  const [slotWinner] = await expectResults(
    slotResults,
    1,
    ['23P01'],
    '100-way artist slot contention',
  );
  const winningId = slotWinner.value.rows[0].id;

  const sharedHost = data.hosts[0];
  const dailyResults = await Promise.allSettled(
    data.artists.slice(1, 101).map((artist, index) => {
      const startAt = new Date(Date.parse('2026-08-03T16:00:00.000Z') + (index % 96) * 15 * 60_000);
      return insertAppointment({
        artist,
        appointmentDate: '2026-08-04',
        dailySequence: (index % 2) + 1,
        endAt: new Date(startAt.getTime() + 15 * 60_000),
        host: sharedHost,
        site: data.site,
        startAt,
        userId: data.userId,
      });
    }),
  );
  await expectResults(dailyResults, 2, ['23505', '23P01'], '100-way host daily contention');

  await pool.query(
    `UPDATE appointments SET status = 'CANCELLED', cancelled_at = CURRENT_TIMESTAMP,
       cancelled_by_user_id = $1, cancellation_reason_code = 'USER_CANCELLED', row_version = 2
     WHERE id = $2`,
    [data.userId, winningId],
  );
  const reused = await insertAppointment({
    artist: sharedArtist,
    appointmentDate: '2026-08-03',
    dailySequence: 1,
    endAt: sameEnd,
    host: data.hosts[1],
    site: data.site,
    startAt: sameStart,
    userId: data.userId,
  });
  const reusedId = reused.rows[0].id;

  const occupied = await pool.query(
    `SELECT artist_id, appointment_date, start_at, end_at
     FROM appointments WHERE host_id = $1 AND appointment_date = DATE '2026-08-04'
       AND status = 'BOOKED' LIMIT 1`,
    [sharedHost.id],
  );
  const transaction = await pool.connect();
  try {
    await transaction.query('BEGIN');
    await transaction.query(
      `UPDATE appointments SET status = 'CANCELLED', cancelled_at = CURRENT_TIMESTAMP,
         cancelled_by_user_id = $1, cancellation_reason_code = 'RESCHEDULED', row_version = 2
       WHERE id = $2`,
      [data.userId, reusedId],
    );
    const target = occupied.rows[0];
    await transaction.query(
      `INSERT INTO appointments (
         host_id, host_code_snapshot, host_name_snapshot,
         artist_id, artist_nickname_snapshot, site_id, site_name_snapshot,
         appointment_date, start_at, end_at, duration_minutes, daily_sequence,
         created_by_user_id, created_by_role, rescheduled_from_appointment_id
       ) VALUES ($1, $2, $3, $4, '冲突目标', $5, $6, $7, $8, $9, 15, 1, $10, 'HOST', $11)`,
      [
        data.hosts[1].id,
        data.hosts[1].host_code,
        data.hosts[1].real_name,
        target.artist_id,
        data.site.id,
        data.site.name,
        target.appointment_date,
        target.start_at,
        target.end_at,
        data.userId,
        reusedId,
      ],
    );
    throw new Error('Conflicting reschedule unexpectedly succeeded');
  } catch (error) {
    await transaction.query('ROLLBACK');
    if (!(error instanceof Error) || !('code' in error) || error.code !== '23P01') throw error;
  } finally {
    transaction.release();
  }
  const originalAfterRollback = await pool.query(
    `SELECT status, row_version FROM appointments WHERE id = $1`,
    [reusedId],
  );
  if (
    originalAfterRollback.rows[0].status !== 'BOOKED' ||
    originalAfterRollback.rows[0].row_version !== 1
  ) {
    throw new Error('Failed reschedule did not restore the original appointment');
  }

  const atomic = await pool.connect();
  let replacementId;
  try {
    await atomic.query('BEGIN');
    replacementId = (await atomic.query(`SELECT uuidv7() AS id`)).rows[0].id;
    await atomic.query(
      `UPDATE appointments SET status = 'CANCELLED', cancelled_at = CURRENT_TIMESTAMP,
         cancelled_by_user_id = $1, cancellation_reason_code = 'RESCHEDULED',
         cancellation_source_type = 'APPOINTMENT', cancellation_source_id = $2, row_version = 2
       WHERE id = $3`,
      [data.userId, replacementId, reusedId],
    );
    await atomic.query(
      `INSERT INTO appointments (
         id, host_id, host_code_snapshot, host_name_snapshot,
         artist_id, artist_nickname_snapshot, site_id, site_name_snapshot,
         appointment_date, start_at, end_at, duration_minutes, daily_sequence,
         created_by_user_id, created_by_role, rescheduled_from_appointment_id
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, DATE '2026-08-05',
         TIMESTAMPTZ '2026-08-05 09:00:00+08', TIMESTAMPTZ '2026-08-05 09:15:00+08',
         15, 1, $9, 'HOST', $10)`,
      [
        replacementId,
        data.hosts[1].id,
        data.hosts[1].host_code,
        data.hosts[1].real_name,
        sharedArtist.id,
        sharedArtist.nickname,
        data.site.id,
        data.site.name,
        data.userId,
        reusedId,
      ],
    );
    for (const [objectId, action] of [
      [reusedId, 'APPOINTMENT_RESCHEDULE_SOURCE_CANCELLED'],
      [replacementId, 'APPOINTMENT_CREATED_BY_RESCHEDULE'],
    ]) {
      await atomic.query(
        `INSERT INTO operation_logs (
           site_id, object_type, object_id, action, actor_user_id,
           actor_name_snapshot, actor_role, after_data
         ) VALUES ($1, 'APPOINTMENT', $2, $3, $4, '并发验收', 'HOST', '{}'::jsonb)`,
        [data.site.id, objectId, action, data.userId],
      );
    }
    await atomic.query(
      `INSERT INTO idempotency_records (
         user_id, scope, idempotency_key, request_hash, response_status,
         response_body, resource_type, resource_id, expires_at
       ) VALUES ($1, 'APPOINTMENT_RESCHEDULE', $2, $3, 201, $4::jsonb,
         'APPOINTMENT', $5, CURRENT_TIMESTAMP + INTERVAL '1 day')`,
      [
        data.userId,
        `concurrency-${Date.now()}`,
        'a'.repeat(64),
        JSON.stringify({ appointmentId: replacementId }),
        replacementId,
      ],
    );
    await atomic.query('COMMIT');
  } catch (error) {
    await atomic.query('ROLLBACK');
    throw error;
  } finally {
    atomic.release();
  }
  const atomicResult = await pool.query(
    `SELECT
       source.status AS source_status,
       source.cancellation_source_id AS linked_replacement,
       replacement.rescheduled_from_appointment_id AS linked_source,
       (SELECT count(*)::integer FROM operation_logs
         WHERE object_id IN ($1, $2) AND action LIKE 'APPOINTMENT_%RESCHEDULE%') AS audit_count,
       (SELECT count(*)::integer FROM idempotency_records
         WHERE resource_id = $2 AND response_status = 201) AS idempotency_count
     FROM appointments source
     JOIN appointments replacement ON replacement.id = $2
     WHERE source.id = $1`,
    [reusedId, replacementId],
  );
  const committed = atomicResult.rows[0];
  if (
    committed.source_status !== 'CANCELLED' ||
    committed.linked_replacement !== replacementId ||
    committed.linked_source !== reusedId ||
    committed.audit_count !== 2 ||
    committed.idempotency_count !== 1
  ) {
    throw new Error('Successful reschedule transaction was not committed as one complete unit');
  }
}

try {
  await admin.connect();
  adminConnected = true;
  await admin.query(`CREATE DATABASE ${quotedIdentifier(databaseName)}`);
  databaseCreated = true;
  migrate();
  pool = new Pool({ connectionString: testUrl.toString(), max: 80 });
  await runChecks();
  console.log(
    'Booking concurrency: 100-way slot, daily limit, reuse, rollback and atomic reschedule verified',
  );
} finally {
  if (pool) await pool.end();
  if (adminConnected && databaseCreated) {
    await admin.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [databaseName],
    );
    await admin.query(`DROP DATABASE IF EXISTS ${quotedIdentifier(databaseName)}`);
  }
  if (adminConnected) await admin.end();
}
