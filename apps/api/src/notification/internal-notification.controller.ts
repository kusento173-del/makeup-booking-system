import { Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';

import { InternalWorkerGuard } from '../booking/internal-worker.guard';
import {
  type NotificationDeliveryBatchResult,
  NotificationDeliveryService,
} from './notification-delivery.service';
import { NotificationOutboxService } from './notification-outbox.service';
import { NotificationScheduleService } from './notification-schedule.service';
import type {
  NotificationChannel,
  NotificationDailySummaryBatchResult,
  NotificationOutboxBatchResult,
  NotificationReminderBatchResult,
} from './notification.types';
import { WechatMiniProgramNotificationAdapter } from './wechat-mini-program-notification.adapter';

export function configuredNotificationChannel(value: string | undefined): NotificationChannel {
  if (value === 'WECHAT_MINI_PROGRAM' || value === 'WECHAT_OFFICIAL_ACCOUNT') return value;
  throw new Error('NOTIFICATION_CHANNEL is not configured');
}

@ApiExcludeController()
@UseGuards(InternalWorkerGuard)
@Controller('internal/jobs')
export class InternalNotificationController {
  constructor(
    private readonly delivery: NotificationDeliveryService,
    private readonly outbox: NotificationOutboxService,
    private readonly schedule: NotificationScheduleService,
    private readonly wechatMiniProgram: WechatMiniProgramNotificationAdapter,
  ) {}

  @Post('notification-outbox')
  @HttpCode(200)
  runOutbox(): Promise<NotificationOutboxBatchResult> {
    return this.outbox.runBatch(configuredNotificationChannel(process.env.NOTIFICATION_CHANNEL));
  }

  @Post('notification-delivery')
  @HttpCode(200)
  runDelivery(): Promise<NotificationDeliveryBatchResult> {
    const channel = configuredNotificationChannel(process.env.NOTIFICATION_CHANNEL);
    if (channel !== 'WECHAT_MINI_PROGRAM') {
      throw new Error('Configured notification channel has no delivery adapter');
    }
    this.wechatMiniProgram.assertConfigured();
    return this.delivery.runBatch(channel, this.wechatMiniProgram);
  }

  @Post('notification-reminders')
  @HttpCode(200)
  runReminders(): Promise<NotificationReminderBatchResult> {
    return this.schedule.runReminderBatch(
      configuredNotificationChannel(process.env.NOTIFICATION_CHANNEL),
    );
  }

  @Post('notification-daily-summaries')
  @HttpCode(200)
  runDailySummaries(): Promise<NotificationDailySummaryBatchResult> {
    return this.schedule.runDailySummary(
      configuredNotificationChannel(process.env.NOTIFICATION_CHANNEL),
    );
  }
}
