import { Module } from '@nestjs/common';

import { AvailabilityModule } from '../availability/availability.module';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { MasterDataModule } from '../master-data/master-data.module';
import { BookingCreateService } from './booking-create.service';
import { BookingRescheduleService } from './booking-reschedule.service';
import { BookingCancelService } from './booking-cancel.service';
import { BookingSlotService } from './booking-slot.service';
import { BookingController } from './booking.controller';
import { AppointmentQueryService } from './appointment-query.service';
import { FixedAppointmentController } from './fixed-appointment.controller';
import { FixedAvailabilityService } from './fixed-availability.service';
import { FixedGenerationService } from './fixed-generation.service';
import { FixedRequestService } from './fixed-request.service';
import { FixedRequestQueryService } from './fixed-request-query.service';
import { FixedRequestReviewService } from './fixed-request-review.service';

@Module({
  controllers: [BookingController, FixedAppointmentController],
  imports: [AuditModule, AuthModule, AvailabilityModule, DatabaseModule, MasterDataModule],
  providers: [
    AppointmentQueryService,
    BookingCancelService,
    BookingCreateService,
    BookingRescheduleService,
    BookingSlotService,
    FixedAvailabilityService,
    FixedGenerationService,
    FixedRequestQueryService,
    FixedRequestReviewService,
    FixedRequestService,
  ],
  exports: [
    AppointmentQueryService,
    BookingCancelService,
    BookingCreateService,
    BookingRescheduleService,
    BookingSlotService,
    FixedAvailabilityService,
    FixedGenerationService,
    FixedRequestQueryService,
    FixedRequestReviewService,
    FixedRequestService,
  ],
})
export class BookingModule {}
