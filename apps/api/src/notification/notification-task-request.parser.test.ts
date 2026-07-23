import { describe, expect, it } from 'vitest';

import { NotificationTaskRequestInvalidError } from './notification-task.errors';
import {
  parseNotificationTaskId,
  parseNotificationTaskListRequest,
  parseRetryNotificationTaskRequest,
} from './notification-task-request.parser';

describe('notification task request parser', () => {
  it('parses the strict list contract without coercion', () => {
    expect(
      parseNotificationTaskListRequest({
        date: '2026-07-23',
        page: '2',
        pageSize: '25',
        recipientRoleCode: 'ARTIST',
        search: ' 柔柔 ',
        status: 'FAILED',
      }),
    ).toMatchObject({
      date: new Date('2026-07-23T00:00:00.000Z'),
      page: 2,
      pageSize: 25,
      recipientRoleCode: 'ARTIST',
      search: '柔柔',
      status: 'FAILED',
    });

    expect(() => parseNotificationTaskListRequest({ page: 1 })).toThrow(
      NotificationTaskRequestInvalidError,
    );
    expect(() => parseNotificationTaskListRequest({ extra: true })).toThrow(
      NotificationTaskRequestInvalidError,
    );
    expect(() => parseNotificationTaskListRequest({ date: '2026-02-30' })).toThrow(
      NotificationTaskRequestInvalidError,
    );
  });

  it('parses retry commands and UUIDs strictly', () => {
    const id = '019b0000-0000-7000-8000-000000000001';
    expect(parseNotificationTaskId(id)).toBe(id);
    expect(
      parseRetryNotificationTaskRequest({ expectedRowVersion: 3, reason: ' 微信服务恢复 ' }),
    ).toEqual({ expectedRowVersion: 3, reason: '微信服务恢复' });
    expect(() =>
      parseRetryNotificationTaskRequest({ expectedRowVersion: '3', reason: '重试' }),
    ).toThrow(NotificationTaskRequestInvalidError);
    expect(() => parseRetryNotificationTaskRequest({ expectedRowVersion: 3, reason: ' ' })).toThrow(
      NotificationTaskRequestInvalidError,
    );
  });
});
