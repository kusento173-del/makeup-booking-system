import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { MasterDataModule } from '../master-data/master-data.module';
import { ArtistShiftService } from './artist-shift.service';
import { ShiftChangeService } from './shift-change.service';
import { ShiftChangeController } from './shift-change.controller';
import { ShiftController } from './shift.controller';

@Module({
  controllers: [ShiftChangeController, ShiftController],
  imports: [AuditModule, AuthModule, DatabaseModule, MasterDataModule],
  providers: [ArtistShiftService, ShiftChangeService],
  exports: [ArtistShiftService, ShiftChangeService],
})
export class ShiftModule {}
