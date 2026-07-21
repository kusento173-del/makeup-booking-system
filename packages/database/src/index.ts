import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../generated/client';

export { Prisma } from '../generated/client';

export type DatabaseClient = PrismaClient;

export function createDatabaseClient(connectionString: string): DatabaseClient {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
}
