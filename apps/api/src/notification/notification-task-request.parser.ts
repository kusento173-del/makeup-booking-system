import {
  NOTIFICATION_TASK_STATUSES,
  type NotificationTaskPageInput,
  type NotificationTaskStatus,
  type RetryNotificationTaskCommand,
} from './notification-task.types';
import { NotificationTaskRequestInvalidError } from './notification-task.errors';
import {
  NOTIFICATION_RECIPIENT_ROLES,
  type NotificationRecipientRole,
} from './notification-template.types';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new NotificationTaskRequestInvalidError();
  }
  return value as Record<string, unknown>;
}

function integer(value: unknown, fallback: number, maximum: number): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) {
    throw new NotificationTaskRequestInvalidError();
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > maximum) {
    throw new NotificationTaskRequestInvalidError();
  }
  return parsed;
}

function optionalText(value: unknown, maximum: number): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new NotificationTaskRequestInvalidError();
  const normalized = value.normalize('NFKC').trim();
  if (!normalized || normalized.length > maximum) throw new NotificationTaskRequestInvalidError();
  return normalized;
}

export function parseNotificationTaskId(value: unknown): string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new NotificationTaskRequestInvalidError();
  }
  return value.toLowerCase();
}

export function parseNotificationTaskListRequest(query: unknown): NotificationTaskPageInput {
  const value = record(query);
  if (
    Object.keys(value).some(
      (key) => !['date', 'page', 'pageSize', 'recipientRoleCode', 'search', 'status'].includes(key),
    )
  ) {
    throw new NotificationTaskRequestInvalidError();
  }
  const status = optionalText(value.status, 16);
  const recipientRoleCode = optionalText(value.recipientRoleCode, 32);
  if (status && !NOTIFICATION_TASK_STATUSES.includes(status as NotificationTaskStatus)) {
    throw new NotificationTaskRequestInvalidError();
  }
  if (
    recipientRoleCode &&
    !NOTIFICATION_RECIPIENT_ROLES.includes(recipientRoleCode as NotificationRecipientRole)
  ) {
    throw new NotificationTaskRequestInvalidError();
  }
  const dateText = optionalText(value.date, 10);
  const search = optionalText(value.search, 64);
  let date: Date | undefined;
  if (dateText) {
    const match = DATE_PATTERN.exec(dateText);
    date = match ? new Date(`${dateText}T00:00:00.000Z`) : undefined;
    if (!date || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== dateText) {
      throw new NotificationTaskRequestInvalidError();
    }
  }
  return {
    ...(date ? { date } : {}),
    page: integer(value.page, 1, 100_000),
    pageSize: integer(value.pageSize, 50, 100),
    ...(recipientRoleCode
      ? { recipientRoleCode: recipientRoleCode as NotificationRecipientRole }
      : {}),
    ...(search ? { search } : {}),
    ...(status ? { status: status as NotificationTaskStatus } : {}),
  };
}

export function parseRetryNotificationTaskRequest(body: unknown): RetryNotificationTaskCommand {
  const value = record(body);
  if (Object.keys(value).some((key) => !['expectedRowVersion', 'reason'].includes(key))) {
    throw new NotificationTaskRequestInvalidError();
  }
  if (!Number.isSafeInteger(value.expectedRowVersion) || Number(value.expectedRowVersion) < 1) {
    throw new NotificationTaskRequestInvalidError();
  }
  const reason = optionalText(value.reason, 500);
  if (!reason) throw new NotificationTaskRequestInvalidError();
  return { expectedRowVersion: Number(value.expectedRowVersion), reason };
}
