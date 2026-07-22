import type { MasterDataCommandContext } from '../master-data/master-data-command.types';

export const NOTIFICATION_TEMPLATE_CODES = [
  'APPOINTMENT_CANCELLED',
  'APPOINTMENT_CREATED',
  'APPOINTMENT_RESCHEDULED',
] as const;

export type NotificationTemplateCode = (typeof NOTIFICATION_TEMPLATE_CODES)[number];
export type NotificationTemplateStatus = 'ACTIVE' | 'DRAFT' | 'RETIRED';
export type NotificationTemplateCommandContext = MasterDataCommandContext;

export interface CreateNotificationTemplateCommand {
  readonly providerTemplateKey: string;
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
  readonly retiredAt: string | null;
  readonly rowVersion: number;
  readonly status: NotificationTemplateStatus;
  readonly templateCode: NotificationTemplateCode;
  readonly variableMappings: readonly string[];
  readonly version: number;
}

export interface NotificationTemplatePreview {
  readonly data: Readonly<Record<string, { readonly value: string }>>;
  readonly providerTemplateKey: string | null;
  readonly templateCode: NotificationTemplateCode;
}
