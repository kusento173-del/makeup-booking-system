import { Controller, Get } from '@nestjs/common';

import { DatabaseService } from './database/database.service';

export interface HealthResponse {
  database: 'ok';
  service: 'api';
  status: 'ok';
}

@Controller('health')
export class HealthController {
  constructor(private readonly database: DatabaseService) {}

  @Get()
  async check(): Promise<HealthResponse> {
    await this.database.assertHealthy();

    return { database: 'ok', service: 'api', status: 'ok' };
  }
}
