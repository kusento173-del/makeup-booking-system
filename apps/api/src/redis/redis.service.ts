import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';

import { REDIS_CLIENT } from './redis.constants';
import type { RedisClient } from './redis-client.provider';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private lastErrorLoggedAt = 0;
  private readonly logger = new Logger(RedisService.name);
  private readonly onError = (error: Error): void => {
    const now = Date.now();
    if (now - this.lastErrorLoggedAt < 30_000) return;
    this.lastErrorLoggedAt = now;
    this.logger.warn(`Redis connection unavailable: ${error.message}`);
  };

  constructor(@Inject(REDIS_CLIENT) private readonly client: RedisClient) {
    this.client.on('error', this.onError);
  }

  async onModuleInit(): Promise<void> {
    if (!this.client.isOpen) {
      await this.client.connect();
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client.isOpen) {
      await this.client.quit();
    }
    this.client.off('error', this.onError);
  }

  async assertHealthy(): Promise<void> {
    await this.client.ping();
  }

  evaluate(script: string, keys: readonly string[], args: readonly string[]): Promise<unknown> {
    return this.client.eval(script, { arguments: [...args], keys: [...keys] });
  }
}
