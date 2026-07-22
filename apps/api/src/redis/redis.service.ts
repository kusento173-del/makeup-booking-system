import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';

import { REDIS_CLIENT } from './redis.constants';
import type { RedisClient } from './redis-client.provider';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  constructor(@Inject(REDIS_CLIENT) private readonly client: RedisClient) {}

  async onModuleInit(): Promise<void> {
    if (!this.client.isOpen) {
      await this.client.connect();
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client.isOpen) {
      await this.client.quit();
    }
  }

  async assertHealthy(): Promise<void> {
    await this.client.ping();
  }

  evaluate(script: string, keys: readonly string[], args: readonly string[]): Promise<unknown> {
    return this.client.eval(script, { arguments: [...args], keys: [...keys] });
  }
}
