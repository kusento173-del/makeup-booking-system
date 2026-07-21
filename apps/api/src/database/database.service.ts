import type { DatabaseClient, Prisma } from '@makeup/database';
import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';

import { DATABASE_CLIENT } from './database.constants';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  constructor(@Inject(DATABASE_CLIENT) private readonly client: DatabaseClient) {}

  async onModuleInit(): Promise<void> {
    await this.client.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }

  async assertHealthy(): Promise<void> {
    await this.client.$queryRaw`SELECT 1`;
  }

  read<T>(operation: (client: DatabaseClient) => Promise<T>): Promise<T> {
    return operation(this.client);
  }

  transaction<T>(operation: (transaction: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.client.$transaction(operation);
  }
}
