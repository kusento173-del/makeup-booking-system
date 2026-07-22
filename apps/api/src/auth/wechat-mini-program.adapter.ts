import { Injectable } from '@nestjs/common';

import { WechatLoginConfigurationError, WechatLoginFailedError } from './wechat-login.errors';
import type { WechatLoginIdentity, WechatLoginPort } from './wechat-login.port';

const CODE_TO_SESSION_URL = 'https://api.weixin.qq.com/sns/jscode2session';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

@Injectable()
export class WechatMiniProgramAdapter implements WechatLoginPort {
  async exchangeCode(jsCode: string): Promise<WechatLoginIdentity> {
    const code = jsCode.trim();
    const appId = process.env.WECHAT_MINI_PROGRAM_APP_ID?.trim();
    const appSecret = process.env.WECHAT_MINI_PROGRAM_APP_SECRET?.trim();

    if (!appId || !appSecret) {
      throw new WechatLoginConfigurationError();
    }

    if (!code || code.length > 256) {
      throw new WechatLoginFailedError();
    }

    const url = new URL(CODE_TO_SESSION_URL);
    url.searchParams.set('appid', appId);
    url.searchParams.set('secret', appSecret);
    url.searchParams.set('js_code', code);
    url.searchParams.set('grant_type', 'authorization_code');

    let response: Response;

    try {
      response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    } catch {
      throw new WechatLoginFailedError();
    }

    if (!response.ok) {
      throw new WechatLoginFailedError();
    }

    let payload: unknown;

    try {
      payload = await response.json();
    } catch {
      throw new WechatLoginFailedError();
    }

    if (
      !isRecord(payload) ||
      typeof payload.openid !== 'string' ||
      !payload.openid.trim() ||
      typeof payload.errcode === 'number'
    ) {
      throw new WechatLoginFailedError();
    }

    return {
      externalSubject: payload.openid,
      providerAppId: appId,
      ...(typeof payload.unionid === 'string' && payload.unionid
        ? { unionId: payload.unionid }
        : {}),
    };
  }
}
