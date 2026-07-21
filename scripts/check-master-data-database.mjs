import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const sql = readFileSync(new URL('../prisma/checks/master-data.sql', import.meta.url), 'utf8');
const database = process.env.MASTER_DATA_CHECK_DATABASE;
const dockerArgs = ['compose', 'exec', '-T'];

if (database) {
  dockerArgs.push('--env', `CHECK_DATABASE=${database}`);
}

dockerArgs.push(
  'postgres',
  'sh',
  '-ec',
  'psql --username "$POSTGRES_USER" --dbname "${CHECK_DATABASE:-$POSTGRES_DB}" --set ON_ERROR_STOP=1 --file -',
);

const result = spawnSync('docker', dockerArgs, {
  encoding: 'utf8',
  input: sql,
  windowsHide: true,
});

if (result.error) {
  throw result.error;
}

if (result.status !== 0) {
  throw new Error(result.stderr.trim() || 'Master data database checks failed');
}

console.log('Master data database constraints: verified');
