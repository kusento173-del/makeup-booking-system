import { afterEach, describe, expect, it, vi } from 'vitest';

import { WechatLoginFailedError } from './wechat-login.errors';
import { WechatMiniProgramAdapter } from './wechat-mini-program.adapter';

describe('WechatMiniProgramAdapter', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('returns only stable identity fields from code2Session', async () => {
    vi.stubEnv('WECHAT_MINI_PROGRAM_APP_ID', 'wx-test-app');
    vi.stubEnv('WECHAT_MINI_PROGRAM_APP_SECRET', 'test-secret');
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          openid: 'openid-1',
          session_key: 'must-not-leave-adapter',
          unionid: 'u-1',
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(new WechatMiniProgramAdapter().exchangeCode('js-code')).resolves.toEqual({
      externalSubject: 'openid-1',
      providerAppId: 'wx-test-app',
      unionId: 'u-1',
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('maps WeChat error payloads to a stable login error', async () => {
    vi.stubEnv('WECHAT_MINI_PROGRAM_APP_ID', 'wx-test-app');
    vi.stubEnv('WECHAT_MINI_PROGRAM_APP_SECRET', 'test-secret');
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          new Response(JSON.stringify({ errcode: 40029, errmsg: 'invalid code' })),
        ),
    );

    await expect(new WechatMiniProgramAdapter().exchangeCode('bad-code')).rejects.toBeInstanceOf(
      WechatLoginFailedError,
    );
  });
});
