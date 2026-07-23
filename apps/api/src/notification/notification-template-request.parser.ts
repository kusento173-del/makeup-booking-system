import { NotificationTemplateRequestInvalidError } from './notification-template.errors';
import {
  NOTIFICATION_RECIPIENT_ROLES,
  NOTIFICATION_TEMPLATE_CODES,
  type CreateNotificationTemplateCommand,
  type NotificationTemplateCode,
  type NotificationRecipientRole,
  type NotificationSubscriptionType,
  type TransitionNotificationTemplateCommand,
} from './notification-template.types';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new NotificationTemplateRequestInvalidError();
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[]): void {
  if (Object.keys(value).some((key) => !allowed.includes(key))) {
    throw new NotificationTemplateRequestInvalidError();
  }
}

function text(value: unknown, maximum: number): string {
  if (typeof value !== 'string') throw new NotificationTemplateRequestInvalidError();
  const normalized = value.normalize('NFKC').trim();
  if (!normalized || normalized.length > maximum) {
    throw new NotificationTemplateRequestInvalidError();
  }
  return normalized;
}

function expectedRowVersion(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) {
    throw new NotificationTemplateRequestInvalidError();
  }
  return Number(value);
}

export function parseNotificationTemplateId(value: unknown): string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new NotificationTemplateRequestInvalidError();
  }
  return value.toLowerCase();
}

export function parseCreateNotificationTemplateRequest(
  body: unknown,
): CreateNotificationTemplateCommand {
  const value = record(body);
  exactKeys(value, [
    'providerTemplateKey',
    'recipientRoleCode',
    'subscriptionType',
    'templateCode',
    'variableMappings',
  ]);
  if (!NOTIFICATION_TEMPLATE_CODES.includes(value.templateCode as NotificationTemplateCode)) {
    throw new NotificationTemplateRequestInvalidError();
  }
  if (!Array.isArray(value.variableMappings) || value.variableMappings.length > 32) {
    throw new NotificationTemplateRequestInvalidError();
  }
  if (!['ONE_TIME', 'PERMANENT'].includes(value.subscriptionType as string)) {
    throw new NotificationTemplateRequestInvalidError();
  }
  if (
    !NOTIFICATION_RECIPIENT_ROLES.includes(value.recipientRoleCode as NotificationRecipientRole)
  ) {
    throw new NotificationTemplateRequestInvalidError();
  }
  return {
    providerTemplateKey: text(value.providerTemplateKey, 128),
    recipientRoleCode: value.recipientRoleCode as NotificationRecipientRole,
    subscriptionType: value.subscriptionType as NotificationSubscriptionType,
    templateCode: value.templateCode as NotificationTemplateCode,
    variableMappings: value.variableMappings.map((mapping) => text(mapping, 64)),
  };
}

export function parseActivateNotificationTemplateRequest(
  body: unknown,
): TransitionNotificationTemplateCommand {
  const value = record(body);
  exactKeys(value, ['expectedRowVersion']);
  return { expectedRowVersion: expectedRowVersion(value.expectedRowVersion) };
}

export function parseRetireNotificationTemplateRequest(
  body: unknown,
): TransitionNotificationTemplateCommand {
  const value = record(body);
  exactKeys(value, ['expectedRowVersion', 'reason']);
  return {
    expectedRowVersion: expectedRowVersion(value.expectedRowVersion),
    reason: text(value.reason, 500),
  };
}
