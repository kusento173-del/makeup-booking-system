import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { AuditQueryController } from './audit-query.controller';
import { AuditQueryService } from './audit-query.service';

@Module({
  controllers: [AuditQueryController],
  imports: [AuthModule, DatabaseModule],
  providers: [AuditQueryService],
})
export class AuditQueryModule {}
