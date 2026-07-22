import { Module } from '@nestjs/common';

import { AvailabilityModule } from '../availability/availability.module';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { BookingCreateService } from './booking-create.service';
import { BookingSlotService } from './booking-slot.service';

@Module({
  imports: [AuditModule, AuthModule, AvailabilityModule, DatabaseModule],
  providers: [BookingCreateService, BookingSlotService],
  exports: [BookingCreateService, BookingSlotService],
})
export class BookingModule {}
