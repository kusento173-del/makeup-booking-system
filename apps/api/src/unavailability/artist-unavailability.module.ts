import { Module } from '@nestjs/common';

import { AvailabilityModule } from '../availability/availability.module';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { MasterDataModule } from '../master-data/master-data.module';
import { ArtistUnavailabilityController } from './artist-unavailability.controller';
import { ArtistUnavailabilityService } from './artist-unavailability.service';

@Module({
  controllers: [ArtistUnavailabilityController],
  exports: [ArtistUnavailabilityService],
  imports: [AuditModule, AuthModule, AvailabilityModule, DatabaseModule, MasterDataModule],
  providers: [ArtistUnavailabilityService],
})
export class ArtistUnavailabilityModule {}
