import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { NotificationProviderError, NotificationSendInput } from './notification-channel.port';
import { WechatMiniProgramNotificationAdapter } from './wechat-mini-program-notification.adapter';

const input: NotificationSendInput = {
  businessKey: 'APPOINTMENT_CREATED:appointment-1:HOST:host-1',
  channel: 'WECHAT_MINI_PROGRAM',
  payload: { appointmentDate: '2026-07-23', hostName: '小雨' },
  providerAppId: 'wx-test-app',
  providerTemplateKey: 'template-1',
  recipientExternalSubject: 'openid-sensitive',
  variableKeys: ['thing1=hostName', 'date2=appointmentDate'],
};

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    headers: { 'content-type': 'application/json' },
  });
}

function requestUrl(call: Parameters<typeof fetch> | undefined): string {
  const value = call?.[0];
  if (typeof value === 'string') return value;
  if (value instanceof URL) return value.toString();
  if (value instanceof Request) return value.url;
  throw new Error('Expected a fetch URL');
}

function requestBody(call: Parameters<typeof fetch> | undefined): string {
  const body = call?.[1]?.body;
  if (typeof body !== 'string') throw new Error('Expected a JSON request body');
  return body;
}

describe('WechatMiniProgramNotificationAdapter', () => {
  beforeEach(() => {
    vi.stubEnv('WECHAT_MINI_PROGRAM_APP_ID', 'wx-test-app');
    vi.stubEnv('WECHAT_MINI_PROGRAM_APP_SECRET', 'test-secret');
    vi.stubEnv('WECHAT_MINI_PROGRAM_STATE', 'trial');
    vi.stubEnv('WECHAT_MINI_PROGRAM_NOTIFICATION_PAGE', 'pages/booking/detail?id=1');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('uses a cached stable token and maps business values to WeChat template fields', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ access_token: 'token-sensitive', expires_in: 7200 }))
      .mockImplementation(() => Promise.resolve(jsonResponse({ errcode: 0, errmsg: 'ok' })));
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new WechatMiniProgramNotificationAdapter();

    await expect(adapter.send(input)).resolves.toEqual({});
    await expect(adapter.send(input)).resolves.toEqual({});

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(requestUrl(fetchMock.mock.calls[0])).toBe(
      'https://api.weixin.qq.com/cgi-bin/stable_token',
    );
    const sendUrl = new URL(requestUrl(fetchMock.mock.calls[1]));
    expect(sendUrl.pathname).toBe('/cgi-bin/message/subscribe/send');
    expect(sendUrl.searchParams.get('access_token')).toBe('token-sensitive');
    const sendBody = JSON.parse(requestBody(fetchMock.mock.calls[1])) as unknown;
    expect(sendBody).toEqual({
      data: {
        date2: { value: '2026-07-23' },
        thing1: { value: '小雨' },
      },
      lang: 'zh_CN',
      miniprogram_state: 'trial',
      page: 'pages/booking/detail?id=1',
      template_id: 'template-1',
      touser: 'openid-sensitive',
    });
  });

  it('refreshes a rejected cached token once before succeeding', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ access_token: 'old-token', expires_in: 7200 }))
      .mockResolvedValueOnce(jsonResponse({ errcode: 40014, errmsg: 'invalid token' }))
      .mockResolvedValueOnce(jsonResponse({ access_token: 'new-token', expires_in: 7200 }))
      .mockResolvedValueOnce(jsonResponse({ errcode: 0, errmsg: 'ok' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(new WechatMiniProgramNotificationAdapter().send(input)).resolves.toEqual({});

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(new URL(requestUrl(fetchMock.mock.calls[3])).searchParams.get('access_token')).toBe(
      'new-token',
    );
  });

  it('classifies temporary WeChat errors as retryable without exposing provider text', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(jsonResponse({ access_token: 'token', expires_in: 7200 }))
        .mockResolvedValueOnce(jsonResponse({ errcode: 43108, errmsg: 'sensitive provider text' })),
    );

    const promise = new WechatMiniProgramNotificationAdapter().send(input);
    await expect(promise).rejects.toMatchObject({
      code: 'WECHAT_SEND_43108',
      retryable: true,
    } satisfies Partial<NotificationProviderError>);
  });

  it('classifies refusal and invalid template data as permanent failures', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ access_token: 'token', expires_in: 7200 }))
      .mockResolvedValueOnce(jsonResponse({ errcode: 43101, errmsg: 'user refuse' }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(new WechatMiniProgramNotificationAdapter().send(input)).rejects.toMatchObject({
      code: 'WECHAT_SEND_43101',
      retryable: false,
    } satisfies Partial<NotificationProviderError>);

    await expect(
      new WechatMiniProgramNotificationAdapter().send({
        ...input,
        variableKeys: ['hostName'],
      }),
    ).rejects.toMatchObject({
      code: 'WECHAT_TEMPLATE_MAPPING_INVALID',
      retryable: false,
    } satisfies Partial<NotificationProviderError>);
  });

  it('rejects placeholder credentials and identities from another mini program', async () => {
    vi.stubEnv('WECHAT_MINI_PROGRAM_APP_SECRET', 'replace-with-wechat-app-secret');
    await expect(new WechatMiniProgramNotificationAdapter().send(input)).rejects.toMatchObject({
      code: 'WECHAT_NOTIFICATION_NOT_CONFIGURED',
      retryable: false,
    } satisfies Partial<NotificationProviderError>);

    vi.stubEnv('WECHAT_MINI_PROGRAM_APP_SECRET', 'test-secret');
    await expect(
      new WechatMiniProgramNotificationAdapter().send({
        ...input,
        providerAppId: 'another-app',
      }),
    ).rejects.toMatchObject({
      code: 'WECHAT_IDENTITY_APP_MISMATCH',
      retryable: false,
    } satisfies Partial<NotificationProviderError>);
  });
});
