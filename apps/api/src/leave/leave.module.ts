import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { MasterDataModule } from '../master-data/master-data.module';
import { LeaveController } from './leave.controller';
import { LeaveService } from './leave.service';

@Module({
  controllers: [LeaveController],
  imports: [AuditModule, AuthModule, DatabaseModule, MasterDataModule],
  providers: [LeaveService],
  exports: [LeaveService],
})
export class LeaveModule {}
