import { apiRequest } from './api-client';
import type {
  NotificationRecipientRole,
  NotificationTemplateCode,
} from './notification-template-api';

export const NOTIFICATION_TASK_STATUSES = [
  'PENDING',
  'PROCESSING',
  'RETRY_WAIT',
  'SUCCEEDED',
  'FAILED',
  'CANCELLED',
] as const;

export type NotificationTaskStatus = (typeof NOTIFICATION_TASK_STATUSES)[number];

export interface NotificationTask {
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
  readonly items: readonly NotificationTask[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
}

export interface NotificationTaskFilters {
  readonly date?: string;
  readonly page?: number;
  readonly pageSize?: number;
  readonly recipientRoleCode?: NotificationRecipientRole;
  readonly search?: string;
  readonly status?: NotificationTaskStatus;
}

export function listNotificationTasks(
  token: string,
  filters: NotificationTaskFilters,
): Promise<NotificationTaskPage> {
  const query = new URLSearchParams();
  if (filters.date) query.set('date', filters.date);
  query.set('page', String(filters.page ?? 1));
  query.set('pageSize', String(filters.pageSize ?? 50));
  if (filters.recipientRoleCode) query.set('recipientRoleCode', filters.recipientRoleCode);
  if (filters.search) query.set('search', filters.search);
  if (filters.status) query.set('status', filters.status);
  return apiRequest(`/notification-tasks?${query.toString()}`, { token });
}

export function retryNotificationTask(
  token: string,
  task: NotificationTask,
  reason: string,
): Promise<{ readonly id: string }> {
  return apiRequest(`/notification-tasks/${task.id}/retry`, {
    body: { expectedRowVersion: task.rowVersion, reason },
    method: 'POST',
    token,
  });
}
