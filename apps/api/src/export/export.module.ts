import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { MasterDataModule } from '../master-data/master-data.module';
import { ExportController } from './export.controller';
import { ExportService } from './export.service';

@Module({
  controllers: [ExportController],
  imports: [AuditModule, AuthModule, DatabaseModule, MasterDataModule],
  providers: [ExportService],
  exports: [ExportService],
})
export class ExportModule {}
