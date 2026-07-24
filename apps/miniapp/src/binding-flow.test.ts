import { describe, expect, it, vi } from 'vitest';

import {
  bindingChallengeExpired,
  submitBindingWithRefresh,
  type AccountBindingTarget,
  type AuthFlowResult,
} from './binding-flow';

const target: AccountBindingTarget = { hostCode: '000001', roleCode: 'HOST' };
const binding = {
  bindingChallenge: 'old-challenge',
  bindingChallengeExpiresAt: '2026-07-24T06:10:00.000Z',
  kind: 'BINDING_REQUIRED',
} as const;
const freshBinding = {
  bindingChallenge: 'fresh-challenge',
  bindingChallengeExpiresAt: '2026-07-24T06:30:00.000Z',
  kind: 'BINDING_REQUIRED',
} as const;
const sessionResult = {
  kind: 'SESSION_CREATED',
  session: { userId: 'user-1' },
} as unknown as AuthFlowResult;

describe('binding flow', () => {
  it('识别无效或已过期的绑定挑战', () => {
    expect(bindingChallengeExpired('invalid', 0)).toBe(true);
    expect(
      bindingChallengeExpired(
        binding.bindingChallengeExpiresAt,
        Date.parse('2026-07-24T06:10:00Z'),
      ),
    ).toBe(true);
  });

  it('有效挑战直接提交，不重复微信登录', async () => {
    const bind = vi.fn().mockResolvedValue(sessionResult);
    const login = vi.fn();

    await expect(
      submitBindingWithRefresh(
        { binding, bindingCode: 'ABCD-EFGH', target },
        { bind, login, now: () => Date.parse('2026-07-24T06:09:00Z') },
      ),
    ).resolves.toBe(sessionResult);

    expect(login).not.toHaveBeenCalled();
    expect(bind).toHaveBeenCalledWith({
      bindingChallenge: 'old-challenge',
      bindingCode: 'ABCD-EFGH',
      target,
    });
  });

  it('提交前发现过期时刷新挑战并保留原表单', async () => {
    const bind = vi.fn().mockResolvedValue(sessionResult);
    const login = vi.fn().mockResolvedValue(freshBinding);

    await submitBindingWithRefresh(
      { binding, bindingCode: 'ABCD-EFGH', target },
      { bind, login, now: () => Date.parse('2026-07-24T06:11:00Z') },
    );

    expect(bind).toHaveBeenCalledWith({
      bindingChallenge: 'fresh-challenge',
      bindingCode: 'ABCD-EFGH',
      target,
    });
  });

  it('服务端判定挑战失效时只刷新并重试一次', async () => {
    const bind = vi
      .fn()
      .mockRejectedValueOnce({ code: 'BINDING_CHALLENGE_INVALID' })
      .mockResolvedValueOnce(sessionResult);
    const login = vi.fn().mockResolvedValue(freshBinding);

    await expect(
      submitBindingWithRefresh(
        { binding, bindingCode: 'ABCD-EFGH', target },
        { bind, login, now: () => Date.parse('2026-07-24T06:09:00Z') },
      ),
    ).resolves.toBe(sessionResult);

    expect(bind).toHaveBeenCalledTimes(2);
    expect(login).toHaveBeenCalledTimes(1);
  });
});
