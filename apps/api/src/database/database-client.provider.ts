import { createDatabaseClient } from '@makeup/database';

export function parseDatabasePoolMax(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
    throw new Error('DATABASE_POOL_MAX must be an integer between 1 and 100');
  }
  return parsed;
}

export function provideDatabaseClient() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error('DATABASE_URL is required');
  }

  const maxConnections = parseDatabasePoolMax(process.env.DATABASE_POOL_MAX);
  return createDatabaseClient(connectionString, {
    ...(maxConnections === undefined ? {} : { maxConnections }),
  });
}
