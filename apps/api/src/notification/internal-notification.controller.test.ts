import { describe, expect, it, vi } from 'vitest';

import type { NotificationOutboxService } from './notification-outbox.service';
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
    const controller = new InternalNotificationController({
      runBatch,
    } as unknown as NotificationOutboxService);
    try {
      await expect(controller.run()).resolves.toMatchObject({
        processedEventCount: 2,
        taskCount: 5,
      });
      expect(runBatch).toHaveBeenCalledWith('WECHAT_MINI_PROGRAM');
    } finally {
      if (previous === undefined) delete process.env.NOTIFICATION_CHANNEL;
      else process.env.NOTIFICATION_CHANNEL = previous;
    }
  });
});
