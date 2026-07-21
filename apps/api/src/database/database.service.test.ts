import type { DatabaseClient } from '@makeup/database';
import { describe, expect, it, vi } from 'vitest';

import { DatabaseService } from './database.service';

function createClientMock() {
  return {
    $connect: vi.fn().mockResolvedValue(undefined),
    $disconnect: vi.fn().mockResolvedValue(undefined),
    $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
    $transaction: vi.fn(async (operation: (client: unknown) => Promise<unknown>) =>
      operation('tx'),
    ),
  };
}

describe('DatabaseService', () => {
  it('owns the shared client lifecycle and readiness query', async () => {
    const client = createClientMock();
    const service = new DatabaseService(client as unknown as DatabaseClient);

    await service.onModuleInit();
    await service.assertHealthy();
    await service.onModuleDestroy();

    expect(client.$connect).toHaveBeenCalledOnce();
    expect(client.$queryRaw).toHaveBeenCalledOnce();
    expect(client.$disconnect).toHaveBeenCalledOnce();
  });

  it('delegates interactive transactions to the shared client', async () => {
    const client = createClientMock();
    const service = new DatabaseService(client as unknown as DatabaseClient);

    await expect(service.transaction((transaction) => Promise.resolve(transaction))).resolves.toBe(
      'tx',
    );
    expect(client.$transaction).toHaveBeenCalledOnce();
  });
});
