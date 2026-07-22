import type { NotificationChannel } from './notification.types';

export interface NotificationSendInput {
  readonly businessKey: string;
  readonly channel: NotificationChannel;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly providerAppId: string;
  readonly providerTemplateKey: string;
  readonly recipientExternalSubject: string;
  readonly variableKeys: readonly string[];
}

export interface NotificationSendResult {
  readonly providerMessageId?: string;
}

export interface NotificationChannelAdapter {
  send(input: NotificationSendInput): Promise<NotificationSendResult>;
}

export class NotificationProviderError extends Error {
  constructor(
    readonly code: string,
    readonly retryable: boolean,
  ) {
    super(code);
    this.name = 'NotificationProviderError';
  }
}
