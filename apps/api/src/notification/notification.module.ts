import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';
import { BookingModule } from '../booking/booking.module';
import { InternalNotificationController } from './internal-notification.controller';
import { NotificationOutboxService } from './notification-outbox.service';

@Module({
  controllers: [InternalNotificationController],
  exports: [NotificationOutboxService],
  imports: [BookingModule, DatabaseModule],
  providers: [NotificationOutboxService],
})
export class NotificationModule {}
