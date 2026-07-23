import type {
  NotificationRecipientRole,
  NotificationTemplateCode,
} from './notification-template.types';

export const NOTIFICATION_TASK_STATUSES = [
  'PENDING',
  'PROCESSING',
  'RETRY_WAIT',
  'SUCCEEDED',
  'FAILED',
  'CANCELLED',
] as const;

export type NotificationTaskStatus = (typeof NOTIFICATION_TASK_STATUSES)[number];

export interface NotificationTaskPageInput {
  readonly date?: Date;
  readonly page: number;
  readonly pageSize: number;
  readonly recipientRoleCode?: NotificationRecipientRole;
  readonly search?: string;
  readonly status?: NotificationTaskStatus;
}

export interface NotificationTaskSummary {
  readonly attemptCount: number;
  readonly canRetry: boolean;
  readonly cancelledAt: string | null;
  readonly createdAt: string;
  readonly failedAt: string | null;
  readonly id: string;
  readonly lastErrorCode: string | null;
  readonly lastErrorSummary: string | null;
  readonly maxAttempts: number;
  readonly recipientName: string;
  readonly recipientRoleCode: NotificationRecipientRole;
  readonly retriedByTaskId: string | null;
  readonly retryOfTaskId: string | null;
  readonly rowVersion: number;
  readonly scheduledAt: string;
  readonly sentAt: string | null;
  readonly siteId: string;
  readonly siteName: string;
  readonly status: NotificationTaskStatus;
  readonly templateCode: NotificationTemplateCode;
}

export interface NotificationTaskPage {
  readonly items: readonly NotificationTaskSummary[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
}

export interface RetryNotificationTaskCommand {
  readonly expectedRowVersion: number;
  readonly reason: string;
}
