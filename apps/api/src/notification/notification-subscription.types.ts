import type { VerifiedAuthorizationContext } from '../auth/authorization.types';
import type {
  NotificationSubscriptionType,
  NotificationTemplateCode,
} from './notification-template.types';

export const NOTIFICATION_SUBSCRIPTION_DECISIONS = ['ACCEPT', 'REJECT', 'BAN', 'FILTER'] as const;

export type NotificationSubscriptionDecision = (typeof NOTIFICATION_SUBSCRIPTION_DECISIONS)[number];

export interface NotificationSubscriptionTemplate {
  readonly providerTemplateKey: string;
  readonly templateCode: NotificationTemplateCode;
  readonly templateVersionId: string;
}

export interface NotificationSubscriptionGroup {
  readonly requestId: string;
  readonly subscriptionType: NotificationSubscriptionType;
  readonly templates: readonly NotificationSubscriptionTemplate[];
}

export interface RecordNotificationSubscriptionCommand {
  readonly decisions: readonly {
    readonly decision: NotificationSubscriptionDecision;
    readonly templateVersionId: string;
  }[];
  readonly requestId: string;
}

export interface NotificationSubscriptionRecorded {
  readonly recordedCount: number;
  readonly requestId: string;
}

export type NotificationSubscriptionContext = VerifiedAuthorizationContext;
