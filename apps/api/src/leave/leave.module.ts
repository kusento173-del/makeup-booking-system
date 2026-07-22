import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { DatabaseModule } from '../database/database.module';
import { LeaveService } from './leave.service';

@Module({
  imports: [AuditModule, DatabaseModule],
  providers: [LeaveService],
  exports: [LeaveService],
})
export class LeaveModule {}
