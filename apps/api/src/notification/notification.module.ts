import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';
import { NotificationOutboxService } from './notification-outbox.service';

@Module({
  exports: [NotificationOutboxService],
  imports: [DatabaseModule],
  providers: [NotificationOutboxService],
})
export class NotificationModule {}
