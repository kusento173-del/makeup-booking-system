import { Prisma } from '@makeup/database';

export async function acquireTransactionLock(
  transaction: Prisma.TransactionClient,
  key: string,
): Promise<void> {
  await transaction.$queryRaw(
    Prisma.sql`SELECT 1 AS acquired FROM pg_advisory_xact_lock(hashtextextended(${key}, 0))`,
  );
}
