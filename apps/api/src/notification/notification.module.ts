import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { BookingModule } from '../booking/booking.module';
import { MasterDataModule } from '../master-data/master-data.module';
import { InternalNotificationController } from './internal-notification.controller';
import { NotificationDeliveryService } from './notification-delivery.service';
import { NotificationOutboxService } from './notification-outbox.service';
import { NotificationTemplateController } from './notification-template.controller';
import { NotificationTemplateService } from './notification-template.service';
import { WechatMiniProgramNotificationAdapter } from './wechat-mini-program-notification.adapter';

@Module({
  controllers: [InternalNotificationController, NotificationTemplateController],
  exports: [NotificationDeliveryService, NotificationOutboxService],
  imports: [AuditModule, AuthModule, BookingModule, DatabaseModule, MasterDataModule],
  providers: [
    NotificationDeliveryService,
    NotificationOutboxService,
    NotificationTemplateService,
    WechatMiniProgramNotificationAdapter,
  ],
})
export class NotificationModule {}
