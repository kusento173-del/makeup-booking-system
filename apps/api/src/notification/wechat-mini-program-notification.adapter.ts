import { Injectable } from '@nestjs/common';

import {
  type NotificationChannelAdapter,
  NotificationProviderError,
  type NotificationSendInput,
  type NotificationSendResult,
} from './notification-channel.port';

const STABLE_TOKEN_URL = 'https://api.weixin.qq.com/cgi-bin/stable_token';
const SUBSCRIPTION_SEND_URL = 'https://api.weixin.qq.com/cgi-bin/message/subscribe/send';
const REQUEST_TIMEOUT_MS = 5_000;
const TOKEN_EARLY_EXPIRY_SECONDS = 5 * 60;
const TOKEN_ERROR_CODES = new Set([40001, 40014, 42001]);
const RETRYABLE_ERROR_CODES = new Set([-1, 43108, 45009, 45011]);
const VARIABLE_MAPPING =
  /^(thing|number|letter|symbol|character_string|time|date|amount|phone_number|car_number|name|phrase|enum)\d{1,2}=([A-Za-z][A-Za-z0-9]*)$/;

interface WechatConfiguration {
  readonly appId: string;
  readonly appSecret: string;
  readonly page?: string;
  readonly state: 'developer' | 'formal' | 'trial';
}

interface CachedToken {
  readonly appId: string;
  readonly expiresAt: number;
  readonly value: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

@Injectable()
export class WechatMiniProgramNotificationAdapter implements NotificationChannelAdapter {
  private cachedToken: CachedToken | null = null;
  private pendingToken: Promise<string> | null = null;

  assertConfigured(): void {
    this.configuration();
  }

  async send(input: NotificationSendInput): Promise<NotificationSendResult> {
    const configuration = this.configuration();
    if (input.channel !== 'WECHAT_MINI_PROGRAM') {
      throw new NotificationProviderError('WECHAT_CHANNEL_UNSUPPORTED', false);
    }
    if (input.providerAppId !== configuration.appId) {
      throw new NotificationProviderError('WECHAT_IDENTITY_APP_MISMATCH', false);
    }

    const body = {
      data: this.templateData(input.variableKeys, input.payload),
      lang: 'zh_CN',
      miniprogram_state: configuration.state,
      ...(configuration.page ? { page: configuration.page } : {}),
      template_id: input.providerTemplateKey,
      touser: input.recipientExternalSubject,
    };
    let token = await this.accessToken(configuration);
    let result = await this.postSubscription(token, body);
    if (TOKEN_ERROR_CODES.has(result.errcode)) {
      this.cachedToken = null;
      token = await this.accessToken(configuration);
      result = await this.postSubscription(token, body);
    }
    if (result.errcode !== 0) {
      throw new NotificationProviderError(
        `WECHAT_SEND_${result.errcode}`,
        RETRYABLE_ERROR_CODES.has(result.errcode) || TOKEN_ERROR_CODES.has(result.errcode),
      );
    }
    const messageId = result['msgid'];
    return typeof messageId === 'string' || typeof messageId === 'number'
      ? { providerMessageId: String(messageId) }
      : {};
  }

  private accessToken(configuration: WechatConfiguration): Promise<string> {
    if (
      this.cachedToken?.appId === configuration.appId &&
      this.cachedToken.expiresAt > Date.now()
    ) {
      return Promise.resolve(this.cachedToken.value);
    }
    if (this.pendingToken) return this.pendingToken;
    const pending = this.requestToken(configuration).finally(() => {
      if (this.pendingToken === pending) this.pendingToken = null;
    });
    this.pendingToken = pending;
    return pending;
  }

  private configuration(): WechatConfiguration {
    const appId = process.env.WECHAT_MINI_PROGRAM_APP_ID?.trim();
    const appSecret = process.env.WECHAT_MINI_PROGRAM_APP_SECRET?.trim();
    if (
      !appId ||
      !appSecret ||
      appId.startsWith('replace-with-') ||
      appSecret.startsWith('replace-with-')
    ) {
      throw new NotificationProviderError('WECHAT_NOTIFICATION_NOT_CONFIGURED', false);
    }
    const state = process.env.WECHAT_MINI_PROGRAM_STATE?.trim() || 'formal';
    if (!['developer', 'formal', 'trial'].includes(state)) {
      throw new NotificationProviderError('WECHAT_MINI_PROGRAM_STATE_INVALID', false);
    }
    const page = process.env.WECHAT_MINI_PROGRAM_NOTIFICATION_PAGE?.trim();
    if (page && (page.length > 1_024 || page.startsWith('/') || page.includes('://'))) {
      throw new NotificationProviderError('WECHAT_NOTIFICATION_PAGE_INVALID', false);
    }
    return {
      appId,
      appSecret,
      ...(page ? { page } : {}),
      state: state as WechatConfiguration['state'],
    };
  }

  private async requestToken(configuration: WechatConfiguration): Promise<string> {
    const payload = await this.postJson(STABLE_TOKEN_URL, {
      appid: configuration.appId,
      grant_type: 'client_credential',
      secret: configuration.appSecret,
    });
    if (typeof payload['errcode'] === 'number' && payload['errcode'] !== 0) {
      const code = payload['errcode'];
      throw new NotificationProviderError(`WECHAT_TOKEN_${code}`, RETRYABLE_ERROR_CODES.has(code));
    }
    const value = payload['access_token'];
    const expiresIn = payload['expires_in'];
    if (typeof value !== 'string' || !value || typeof expiresIn !== 'number' || expiresIn <= 0) {
      throw new NotificationProviderError('WECHAT_TOKEN_RESPONSE_INVALID', true);
    }
    this.cachedToken = {
      appId: configuration.appId,
      expiresAt: Date.now() + Math.max(30, expiresIn - TOKEN_EARLY_EXPIRY_SECONDS) * 1_000,
      value,
    };
    return value;
  }

  private async postSubscription(
    token: string,
    body: Readonly<Record<string, unknown>>,
  ): Promise<Record<string, unknown> & { errcode: number }> {
    const url = new URL(SUBSCRIPTION_SEND_URL);
    url.searchParams.set('access_token', token);
    const payload = await this.postJson(url, body);
    if (typeof payload['errcode'] !== 'number') {
      throw new NotificationProviderError('WECHAT_SEND_RESPONSE_INVALID', true);
    }
    return payload as Record<string, unknown> & { errcode: number };
  }

  private async postJson(
    url: string | URL,
    body: Readonly<Record<string, unknown>>,
  ): Promise<Record<string, unknown>> {
    let response: Response;
    try {
      response = await fetch(url, {
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new NotificationProviderError('WECHAT_TRANSPORT_UNAVAILABLE', true);
    }
    if (!response.ok) {
      throw new NotificationProviderError(`WECHAT_HTTP_${response.status}`, response.status >= 500);
    }
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new NotificationProviderError('WECHAT_RESPONSE_INVALID', true);
    }
    if (!isRecord(payload)) {
      throw new NotificationProviderError('WECHAT_RESPONSE_INVALID', true);
    }
    return payload;
  }

  private templateData(
    mappings: readonly string[],
    payload: Readonly<Record<string, unknown>>,
  ): Readonly<Record<string, { readonly value: string }>> {
    if (mappings.length === 0) {
      throw new NotificationProviderError('WECHAT_TEMPLATE_MAPPING_INVALID', false);
    }
    const data: Record<string, { value: string }> = {};
    for (const mapping of mappings) {
      const match = VARIABLE_MAPPING.exec(mapping);
      if (!match) throw new NotificationProviderError('WECHAT_TEMPLATE_MAPPING_INVALID', false);
      const providerKey = mapping.slice(0, mapping.indexOf('='));
      const payloadKey = match[2];
      if (!payloadKey) {
        throw new NotificationProviderError('WECHAT_TEMPLATE_MAPPING_INVALID', false);
      }
      const value = payload[payloadKey];
      if (
        value === undefined ||
        value === null ||
        (typeof value !== 'boolean' && typeof value !== 'number' && typeof value !== 'string') ||
        providerKey in data
      ) {
        throw new NotificationProviderError('WECHAT_TEMPLATE_DATA_INVALID', false);
      }
      data[providerKey] = { value: typeof value === 'string' ? value : String(value) };
    }
    return data;
  }
}
