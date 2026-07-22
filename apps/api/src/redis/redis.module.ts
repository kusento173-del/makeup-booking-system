import { Module } from '@nestjs/common';

import { provideRedisClient } from './redis-client.provider';
import { REDIS_CLIENT } from './redis.constants';
import { RedisService } from './redis.service';

@Module({
  providers: [{ provide: REDIS_CLIENT, useFactory: provideRedisClient }, RedisService],
  exports: [RedisService],
})
export class RedisModule {}
