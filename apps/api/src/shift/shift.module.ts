import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { ArtistShiftService } from './artist-shift.service';

@Module({
  imports: [AuditModule, AuthModule, DatabaseModule],
  providers: [ArtistShiftService],
  exports: [ArtistShiftService],
})
export class ShiftModule {}
