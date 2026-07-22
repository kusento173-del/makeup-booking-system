import { Module } from '@nestjs/common';

import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health.controller';
import { MasterDataModule } from './master-data/master-data.module';
import { RedisModule } from './redis/redis.module';

@Module({
  imports: [AuditModule, AuthModule, DatabaseModule, MasterDataModule, RedisModule],
  controllers: [HealthController],
})
export class AppModule {}
