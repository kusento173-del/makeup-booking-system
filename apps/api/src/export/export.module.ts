import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { BookingModule } from '../booking/booking.module';
import { DatabaseModule } from '../database/database.module';
import { MasterDataModule } from '../master-data/master-data.module';
import { ExportController } from './export.controller';
import { ExportFileService } from './export-file.service';
import { ExportProcessorService } from './export-processor.service';
import { ExportService } from './export.service';
import { InternalExportController } from './internal-export.controller';

@Module({
  controllers: [ExportController, InternalExportController],
  imports: [AuditModule, AuthModule, BookingModule, DatabaseModule, MasterDataModule],
  providers: [ExportFileService, ExportProcessorService, ExportService],
  exports: [ExportFileService, ExportProcessorService, ExportService],
})
export class ExportModule {}
