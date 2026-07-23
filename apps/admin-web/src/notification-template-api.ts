import { apiRequest } from './api-client';

export const NOTIFICATION_TEMPLATE_CODES = [
  'APPOINTMENT_NOTICE',
  'APPOINTMENT_REMINDER',
  'DAILY_SCHEDULE_SUMMARY',
] as const;
export const NOTIFICATION_RECIPIENT_ROLES = ['HOST', 'ARTIST', 'OPERATOR'] as const;

export type NotificationTemplateCode = (typeof NOTIFICATION_TEMPLATE_CODES)[number];
export type NotificationRecipientRole = (typeof NOTIFICATION_RECIPIENT_ROLES)[number];
export type NotificationTemplateStatus = 'ACTIVE' | 'DRAFT' | 'RETIRED';
export type NotificationSubscriptionType = 'ONE_TIME' | 'PERMANENT';

export const NOTIFICATION_TEMPLATE_RECIPIENT_ROLES: Readonly<
  Record<NotificationTemplateCode, readonly NotificationRecipientRole[]>
> = {
  APPOINTMENT_NOTICE: ['HOST', 'ARTIST', 'OPERATOR'],
  APPOINTMENT_REMINDER: ['HOST'],
  DAILY_SCHEDULE_SUMMARY: ['ARTIST', 'OPERATOR'],
};

export interface NotificationTemplate {
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

export function listNotificationTemplates(token: string): Promise<readonly NotificationTemplate[]> {
  return apiRequest('/notification-templates', { token });
}

export function previewNotificationTemplate(
  token: string,
  templateId: string,
): Promise<NotificationTemplatePreview> {
  return apiRequest(`/notification-templates/${templateId}/preview`, { token });
}

export function createNotificationTemplate(
  token: string,
  input: {
    readonly providerTemplateKey: string;
    readonly recipientRoleCode: NotificationRecipientRole;
    readonly subscriptionType: NotificationSubscriptionType;
    readonly templateCode: NotificationTemplateCode;
    readonly variableMappings: readonly string[];
  },
): Promise<NotificationTemplate> {
  return apiRequest('/notification-templates', { body: input, method: 'POST', token });
}

export function activateNotificationTemplate(
  token: string,
  template: NotificationTemplate,
): Promise<NotificationTemplate> {
  return apiRequest(`/notification-templates/${template.id}/activate`, {
    body: { expectedRowVersion: template.rowVersion },
    method: 'POST',
    token,
  });
}

export function retireNotificationTemplate(
  token: string,
  template: NotificationTemplate,
  reason: string,
): Promise<NotificationTemplate> {
  return apiRequest(`/notification-templates/${template.id}/retire`, {
    body: { expectedRowVersion: template.rowVersion, reason },
    method: 'POST',
    token,
  });
}
