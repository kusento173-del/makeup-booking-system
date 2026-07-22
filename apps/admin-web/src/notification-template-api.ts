import { apiRequest } from './api-client';

export const NOTIFICATION_TEMPLATE_CODES = [
  'APPOINTMENT_CANCELLED',
  'APPOINTMENT_CREATED',
  'APPOINTMENT_RESCHEDULED',
] as const;

export type NotificationTemplateCode = (typeof NOTIFICATION_TEMPLATE_CODES)[number];
export type NotificationTemplateStatus = 'ACTIVE' | 'DRAFT' | 'RETIRED';
export type NotificationSubscriptionType = 'ONE_TIME' | 'PERMANENT';

export interface NotificationTemplate {
  readonly activatedAt: string | null;
  readonly channel: 'WECHAT_MINI_PROGRAM';
  readonly createdAt: string;
  readonly id: string;
  readonly providerTemplateKey: string | null;
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
