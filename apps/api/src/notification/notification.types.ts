export const NOTIFICATION_EVENT_TYPES = [
  'APPOINTMENT_CANCELLED',
  'APPOINTMENT_CREATED',
  'APPOINTMENT_RESCHEDULED_FROM',
  'APPOINTMENT_RESCHEDULED_TO',
  'FIXED_APPOINTMENT_CANCELLED_BY_RULE_REQUEST',
  'FIXED_APPOINTMENT_GENERATED',
] as const;

export type NotificationEventType = (typeof NOTIFICATION_EVENT_TYPES)[number];
export type NotificationChannel = 'WECHAT_MINI_PROGRAM' | 'WECHAT_OFFICIAL_ACCOUNT';

export interface NotificationOutboxResult {
  readonly eventId: string | null;
  readonly status: 'CREATED' | 'DEFERRED' | 'EMPTY';
  readonly taskCount: number;
}

export interface NotificationOutboxBatchResult {
  readonly deferredEventCount: number;
  readonly processedEventCount: number;
  readonly taskCount: number;
}
