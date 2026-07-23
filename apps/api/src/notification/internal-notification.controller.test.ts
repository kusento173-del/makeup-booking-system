import { describe, expect, it, vi } from 'vitest';

import type { NotificationDeliveryService } from './notification-delivery.service';
import type { NotificationOutboxService } from './notification-outbox.service';
import type { NotificationScheduleService } from './notification-schedule.service';
import type { WechatMiniProgramNotificationAdapter } from './wechat-mini-program-notification.adapter';
import {
  configuredNotificationChannel,
  InternalNotificationController,
} from './internal-notification.controller';

describe('InternalNotificationController', () => {
  it('accepts only explicitly supported channels', () => {
    expect(configuredNotificationChannel('WECHAT_MINI_PROGRAM')).toBe('WECHAT_MINI_PROGRAM');
    expect(configuredNotificationChannel('WECHAT_OFFICIAL_ACCOUNT')).toBe(
      'WECHAT_OFFICIAL_ACCOUNT',
    );
    expect(() => configuredNotificationChannel(undefined)).toThrow(
      'NOTIFICATION_CHANNEL is not configured',
    );
    expect(() => configuredNotificationChannel('EMAIL')).toThrow(
      'NOTIFICATION_CHANNEL is not configured',
    );
  });

  it('runs one bounded outbox batch using server-side channel configuration', async () => {
    const previous = process.env.NOTIFICATION_CHANNEL;
    process.env.NOTIFICATION_CHANNEL = 'WECHAT_MINI_PROGRAM';
    const runBatch = vi.fn().mockResolvedValue({
      deferredEventCount: 0,
      processedEventCount: 2,
      taskCount: 5,
    });
    const controller = new InternalNotificationController(
      {} as NotificationDeliveryService,
      { runBatch } as unknown as NotificationOutboxService,
      {} as NotificationScheduleService,
      {} as WechatMiniProgramNotificationAdapter,
    );
    try {
      await expect(controller.runOutbox()).resolves.toMatchObject({
        processedEventCount: 2,
        taskCount: 5,
      });
      expect(runBatch).toHaveBeenCalledWith('WECHAT_MINI_PROGRAM');
    } finally {
      if (previous === undefined) delete process.env.NOTIFICATION_CHANNEL;
      else process.env.NOTIFICATION_CHANNEL = previous;
    }
  });

  it('dispatches a bounded batch only through the configured mini-program adapter', async () => {
    const previous = process.env.NOTIFICATION_CHANNEL;
    process.env.NOTIFICATION_CHANNEL = 'WECHAT_MINI_PROGRAM';
    const runBatch = vi.fn().mockResolvedValue({
      failedCount: 0,
      processedCount: 2,
      retryCount: 0,
      succeededCount: 2,
    });
    const assertConfigured = vi.fn();
    const adapter = { assertConfigured } as unknown as WechatMiniProgramNotificationAdapter;
    const controller = new InternalNotificationController(
      { runBatch } as unknown as NotificationDeliveryService,
      {} as NotificationOutboxService,
      {} as NotificationScheduleService,
      adapter,
    );
    try {
      await expect(controller.runDelivery()).resolves.toMatchObject({
        processedCount: 2,
        succeededCount: 2,
      });
      expect(assertConfigured).toHaveBeenCalledOnce();
      expect(runBatch).toHaveBeenCalledWith('WECHAT_MINI_PROGRAM', adapter);
    } finally {
      if (previous === undefined) delete process.env.NOTIFICATION_CHANNEL;
      else process.env.NOTIFICATION_CHANNEL = previous;
    }
  });

  it('runs the reminder reconciliation through the configured channel', async () => {
    const previous = process.env.NOTIFICATION_CHANNEL;
    process.env.NOTIFICATION_CHANNEL = 'WECHAT_MINI_PROGRAM';
    const runReminderBatch = vi.fn().mockResolvedValue({
      cancelledTaskCount: 1,
      createdTaskCount: 2,
      templateAvailable: true,
    });
    const controller = new InternalNotificationController(
      {} as NotificationDeliveryService,
      {} as NotificationOutboxService,
      { runReminderBatch } as unknown as NotificationScheduleService,
      {} as WechatMiniProgramNotificationAdapter,
    );
    try {
      await expect(controller.runReminders()).resolves.toMatchObject({
        cancelledTaskCount: 1,
        createdTaskCount: 2,
      });
      expect(runReminderBatch).toHaveBeenCalledWith('WECHAT_MINI_PROGRAM');
    } finally {
      if (previous === undefined) delete process.env.NOTIFICATION_CHANNEL;
      else process.env.NOTIFICATION_CHANNEL = previous;
    }
  });
});
