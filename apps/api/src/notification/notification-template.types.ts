import type { MasterDataCommandContext } from '../master-data/master-data-command.types';

export const NOTIFICATION_TEMPLATE_CODES = ['APPOINTMENT_NOTICE'] as const;
export const NOTIFICATION_RECIPIENT_ROLES = ['HOST', 'ARTIST', 'OPERATOR'] as const;

export type NotificationTemplateCode = (typeof NOTIFICATION_TEMPLATE_CODES)[number];
export type NotificationRecipientRole = (typeof NOTIFICATION_RECIPIENT_ROLES)[number];
export type NotificationTemplateStatus = 'ACTIVE' | 'DRAFT' | 'RETIRED';
export type NotificationSubscriptionType = 'ONE_TIME' | 'PERMANENT';
export type NotificationTemplateCommandContext = MasterDataCommandContext;

export interface CreateNotificationTemplateCommand {
  readonly providerTemplateKey: string;
  readonly recipientRoleCode: NotificationRecipientRole;
  readonly subscriptionType: NotificationSubscriptionType;
  readonly templateCode: NotificationTemplateCode;
  readonly variableMappings: readonly string[];
}

export interface TransitionNotificationTemplateCommand {
  readonly expectedRowVersion: number;
  readonly reason?: string;
}

export interface NotificationTemplateSummary {
  readonly activatedAt: string | null;
  readonly channel: 'WECHAT_MINI_PROGRAM';
  readonly createdAt: string;
  readonly id: string;
  readonly providerTemplateKey: string | null;
  readonly recipientRoleCode: NotificationRecipientRole;
  readonly retiredAt: string | null;
  readonly rowVersion: number;
  readonly status: NotificationTemplateStatus;
  readonly subscriptionType: NotificationSubscriptionType;
  readonly templateCode: NotificationTemplateCode;
  readonly variableMappings: readonly string[];
  readonly version: number;
}

export interface NotificationTemplatePreview {
  readonly data: Readonly<Record<string, { readonly value: string }>>;
  readonly providerTemplateKey: string | null;
  readonly recipientRoleCode: NotificationRecipientRole;
  readonly templateCode: NotificationTemplateCode;
}
