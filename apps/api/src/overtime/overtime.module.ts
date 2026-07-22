import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { OvertimeService } from './overtime.service';

@Module({
  imports: [AuditModule, AuthModule, DatabaseModule],
  providers: [OvertimeService],
  exports: [OvertimeService],
})
export class OvertimeModule {}
