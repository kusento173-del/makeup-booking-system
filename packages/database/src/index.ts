import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../generated/client';

export { Prisma } from '../generated/client';

export type DatabaseClient = PrismaClient;

export type DatabaseClientOptions = {
  readonly maxConnections?: number;
};

export function createDatabaseClient(
  connectionString: string,
  options: DatabaseClientOptions = {},
): DatabaseClient {
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString,
      ...(options.maxConnections === undefined ? {} : { max: options.maxConnections }),
    }),
  });
}
