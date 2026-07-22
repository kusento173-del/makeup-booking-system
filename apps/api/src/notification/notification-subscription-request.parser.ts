import { NotificationSubscriptionRequestInvalidError } from './notification-subscription.errors';
import {
  NOTIFICATION_SUBSCRIPTION_DECISIONS,
  type NotificationSubscriptionDecision,
  type RecordNotificationSubscriptionCommand,
} from './notification-subscription.types';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function uuid(value: unknown): string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new NotificationSubscriptionRequestInvalidError();
  }
  return value.toLowerCase();
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new NotificationSubscriptionRequestInvalidError();
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[]): void {
  if (Object.keys(value).some((key) => !allowed.includes(key))) {
    throw new NotificationSubscriptionRequestInvalidError();
  }
}

export function parseNotificationSubscriptionRequest(
  body: unknown,
): RecordNotificationSubscriptionCommand {
  const value = record(body);
  exactKeys(value, ['decisions', 'requestId']);
  if (!Array.isArray(value.decisions) || value.decisions.length < 1 || value.decisions.length > 5) {
    throw new NotificationSubscriptionRequestInvalidError();
  }
  const decisions = value.decisions.map((item) => {
    const decision = record(item);
    exactKeys(decision, ['decision', 'templateVersionId']);
    if (
      !NOTIFICATION_SUBSCRIPTION_DECISIONS.includes(
        decision.decision as NotificationSubscriptionDecision,
      )
    ) {
      throw new NotificationSubscriptionRequestInvalidError();
    }
    return {
      decision: decision.decision as NotificationSubscriptionDecision,
      templateVersionId: uuid(decision.templateVersionId),
    };
  });
  if (new Set(decisions.map((item) => item.templateVersionId)).size !== decisions.length) {
    throw new NotificationSubscriptionRequestInvalidError();
  }
  return { decisions, requestId: uuid(value.requestId) };
}
