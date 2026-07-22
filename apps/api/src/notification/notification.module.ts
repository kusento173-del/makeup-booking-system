import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';
import { BookingModule } from '../booking/booking.module';
import { InternalNotificationController } from './internal-notification.controller';
import { NotificationDeliveryService } from './notification-delivery.service';
import { NotificationOutboxService } from './notification-outbox.service';

@Module({
  controllers: [InternalNotificationController],
  exports: [NotificationDeliveryService, NotificationOutboxService],
  imports: [BookingModule, DatabaseModule],
  providers: [NotificationDeliveryService, NotificationOutboxService],
})
export class NotificationModule {}
