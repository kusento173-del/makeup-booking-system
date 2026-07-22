import { Controller, Get } from '@nestjs/common';

import { DatabaseService } from './database/database.service';
import { RedisService } from './redis/redis.service';

export interface HealthResponse {
  database: 'ok';
  redis: 'ok';
  service: 'api';
  status: 'ok';
}

@Controller('health')
export class HealthController {
  constructor(
    private readonly database: DatabaseService,
    private readonly redis: RedisService,
  ) {}

  @Get()
  async check(): Promise<HealthResponse> {
    await this.database.assertHealthy();
    await this.redis.assertHealthy();

    return { database: 'ok', redis: 'ok', service: 'api', status: 'ok' };
  }
}
