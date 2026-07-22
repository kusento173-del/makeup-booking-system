import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';
import { ArtistAvailabilityService } from './artist-availability.service';

@Module({
  imports: [DatabaseModule],
  providers: [ArtistAvailabilityService],
  exports: [ArtistAvailabilityService],
})
export class AvailabilityModule {}
