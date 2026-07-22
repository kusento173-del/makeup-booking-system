import { Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';

import { InternalWorkerGuard } from '../booking/internal-worker.guard';
import { NotificationOutboxService } from './notification-outbox.service';
import type { NotificationChannel, NotificationOutboxBatchResult } from './notification.types';

export function configuredNotificationChannel(value: string | undefined): NotificationChannel {
  if (value === 'WECHAT_MINI_PROGRAM' || value === 'WECHAT_OFFICIAL_ACCOUNT') return value;
  throw new Error('NOTIFICATION_CHANNEL is not configured');
}

@ApiExcludeController()
@UseGuards(InternalWorkerGuard)
@Controller('internal/jobs')
export class InternalNotificationController {
  constructor(private readonly outbox: NotificationOutboxService) {}

  @Post('notification-outbox')
  @HttpCode(200)
  run(): Promise<NotificationOutboxBatchResult> {
    return this.outbox.runBatch(configuredNotificationChannel(process.env.NOTIFICATION_CHANNEL));
  }
}
