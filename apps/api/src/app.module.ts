import { Module } from '@nestjs/common';

import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { HealthController } from './health.controller';
import { MasterDataModule } from './master-data/master-data.module';

@Module({
  imports: [AuditModule, AuthModule, MasterDataModule],
  controllers: [HealthController],
})
export class AppModule {}
