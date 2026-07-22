import { Module } from '@nestjs/common';

import { AvailabilityModule } from '../availability/availability.module';
import { DatabaseModule } from '../database/database.module';
import { BookingSlotService } from './booking-slot.service';

@Module({
  imports: [AvailabilityModule, DatabaseModule],
  providers: [BookingSlotService],
  exports: [BookingSlotService],
})
export class BookingModule {}
