import { describe, expect, it, vi } from 'vitest';

import type { AccountBindingService } from './account-binding.service';
import { AuthFlowService } from './auth-flow.service';
import type { AuthSessionService } from './auth-session.service';
import type { RoleSelectionChallengeService } from './role-selection-challenge.service';
import type { WechatLoginService } from './wechat-login.service';

const role = { roleAssignmentId: 'role-1', roleCode: 'HOST', siteId: null } as const;
const session = {
  accessToken: 'access-token',
  accessTokenExpiresAt: new Date('2026-07-22T04:15:00.000Z'),
  refreshToken: 'refresh-token',
  refreshTokenExpiresAt: new Date('2026-08-21T04:00:00.000Z'),
  role,
  sessionId: 'session-1',
  userId: 'user-1',
};

function createService() {
  const bind = vi.fn();
  const issue = vi.fn();
  const consume = vi.fn();
  const create = vi.fn().mockResolvedValue(session);
  const login = vi.fn();
  const service = new AuthFlowService(
    { bind } as unknown as AccountBindingService,
    { consume, issue } as unknown as RoleSelectionChallengeService,
    { create } as unknown as AuthSessionService,
    { login } as unknown as WechatLoginService,
  );

  return { bind, consume, create, issue, login, service };
}

describe('AuthFlowService', () => {
  it('returns the binding challenge without creating a formal session', async () => {
    const { create, login, service } = createService();
    login.mockResolvedValue({
      bindingChallenge: 'binding-challenge',
      bindingChallengeExpiresAt: new Date('2026-07-22T04:10:00.000Z'),
      kind: 'BINDING_REQUIRED',
    });

    await expect(service.login('wx-code')).resolves.toMatchObject({
      bindingChallenge: 'binding-challenge',
      kind: 'BINDING_REQUIRED',
    });
    expect(create).not.toHaveBeenCalled();
  });

  it('creates a formal session immediately for a verified single-role account', async () => {
    const { create, login, service } = createService();
    login.mockResolvedValue({
      kind: 'ACCOUNT_RECOGNIZED',
      requiresRoleSelection: false,
      roles: [role],
      userId: 'user-1',
    });

    await expect(service.login('wx-code')).resolves.toEqual({
      kind: 'SESSION_CREATED',
      session,
    });
    expect(create).toHaveBeenCalledWith('user-1', 'role-1');
  });

  it('returns a one-time selection challenge instead of trusting a client user ID', async () => {
    const secondRole = { roleAssignmentId: 'role-2', roleCode: 'OPERATOR', siteId: null } as const;
    const { issue, login, service } = createService();
    login.mockResolvedValue({
      kind: 'ACCOUNT_RECOGNIZED',
      requiresRoleSelection: true,
      roles: [role, secondRole],
      userId: 'user-1',
    });
    issue.mockResolvedValue({
      expiresAt: new Date('2026-07-22T04:05:00.000Z'),
      roles: [role, secondRole],
      token: 'selection-challenge',
    });

    await expect(service.login('wx-code')).resolves.toEqual({
      expiresAt: new Date('2026-07-22T04:05:00.000Z'),
      kind: 'ROLE_SELECTION_REQUIRED',
      roles: [role, secondRole],
      roleSelectionChallenge: 'selection-challenge',
    });
    expect(issue).toHaveBeenCalledWith('user-1');
  });

  it('consumes the selection challenge before creating the selected session', async () => {
    const { consume, create, service } = createService();
    consume.mockResolvedValue('user-1');

    await expect(service.selectRole('selection-challenge', 'role-1')).resolves.toEqual({
      kind: 'SESSION_CREATED',
      session,
    });
    expect(consume).toHaveBeenCalledWith('selection-challenge', 'role-1');
    expect(create).toHaveBeenCalledWith('user-1', 'role-1');
  });
});
