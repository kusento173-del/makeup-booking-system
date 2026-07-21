import { spawnSync } from 'node:child_process';

function runDocker(args) {
  const result = spawnSync('docker', args, {
    encoding: 'utf8',
    windowsHide: true,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `docker ${args.join(' ')} failed`);
  }

  return result.stdout.trim();
}

const postgresResult = runDocker([
  'compose',
  'exec',
  '-T',
  'postgres',
  'sh',
  '-ec',
  'psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --tuples-only --no-align --command "SELECT 1 FROM pg_available_extensions WHERE name = \'btree_gist\';"',
]);

if (postgresResult !== '1') {
  throw new Error('PostgreSQL is reachable, but the btree_gist extension is unavailable');
}

const redisResult = runDocker([
  'compose',
  'exec',
  '-T',
  'redis',
  'sh',
  '-ec',
  'redis-cli --no-auth-warning -a "$REDIS_PASSWORD" ping',
]);

if (redisResult !== 'PONG') {
  throw new Error(`Unexpected Redis response: ${redisResult || '<empty>'}`);
}

console.log('PostgreSQL: connected; btree_gist is available');
console.log('Redis: connected; authenticated PING returned PONG');
