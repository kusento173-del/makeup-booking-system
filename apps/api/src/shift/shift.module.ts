import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { MasterDataModule } from '../master-data/master-data.module';
import { ArtistShiftService } from './artist-shift.service';
import { ShiftController } from './shift.controller';

@Module({
  controllers: [ShiftController],
  imports: [AuditModule, AuthModule, DatabaseModule, MasterDataModule],
  providers: [ArtistShiftService],
  exports: [ArtistShiftService],
})
export class ShiftModule {}
