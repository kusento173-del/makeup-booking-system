import { createDatabaseClient } from '@makeup/database';

export function provideDatabaseClient() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error('DATABASE_URL is required');
  }

  return createDatabaseClient(connectionString);
}
