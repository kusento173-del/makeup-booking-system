import { Module } from '@nestjs/common';

import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health.controller';
import { LeaveModule } from './leave/leave.module';
import { MasterDataModule } from './master-data/master-data.module';
import { RedisModule } from './redis/redis.module';
import { ShiftModule } from './shift/shift.module';

@Module({
  imports: [
    AuditModule,
    AuthModule,
    DatabaseModule,
    LeaveModule,
    MasterDataModule,
    RedisModule,
    ShiftModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
