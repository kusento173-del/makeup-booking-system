import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { MasterDataModule } from '../master-data/master-data.module';
import { OvertimeController } from './overtime.controller';
import { OvertimeService } from './overtime.service';

@Module({
  controllers: [OvertimeController],
  imports: [AuditModule, AuthModule, DatabaseModule, MasterDataModule],
  providers: [OvertimeService],
  exports: [OvertimeService],
})
export class OvertimeModule {}
