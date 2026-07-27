import { describe, expect, it, vi } from 'vitest';

import { AuthFlowService } from './auth-flow.service';
import type { AuthSessionService } from './auth-session.service';
import type { PasswordChangeChallengeService } from './password-change-challenge.service';
import type { RoleSelectionChallengeService } from './role-selection-challenge.service';

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
  const issuePasswordChange = vi.fn();
  const issueRoleSelection = vi.fn();
  const consume = vi.fn();
  const create = vi.fn().mockResolvedValue(session);
  const service = new AuthFlowService(
    { consume, issue: issueRoleSelection } as unknown as RoleSelectionChallengeService,
    { create } as unknown as AuthSessionService,
    { issue: issuePasswordChange } as unknown as PasswordChangeChallengeService,
  );

  return { consume, create, issuePasswordChange, issueRoleSelection, service };
}

describe('AuthFlowService', () => {
  it('requires a one-time password change before creating a session', async () => {
    const { create, issuePasswordChange, service } = createService();
    issuePasswordChange.mockResolvedValue({
      expiresAt: new Date('2026-07-22T04:05:00.000Z'),
      token: 'password-change-challenge',
    });

    await expect(
      service.completeVerifiedAccount({
        mustChangePassword: true,
        roles: [role],
        userId: 'user-1',
      }),
    ).resolves.toEqual({
      expiresAt: new Date('2026-07-22T04:05:00.000Z'),
      kind: 'PASSWORD_CHANGE_REQUIRED',
      passwordChangeChallenge: 'password-change-challenge',
    });
    expect(create).not.toHaveBeenCalled();
  });

  it('creates a formal session immediately for a verified single-role account', async () => {
    const { create, service } = createService();

    await expect(
      service.completeVerifiedAccount({ roles: [role], userId: 'user-1' }),
    ).resolves.toEqual({
      kind: 'SESSION_CREATED',
      session,
    });
    expect(create).toHaveBeenCalledWith('user-1', 'role-1');
  });

  it('returns a one-time selection challenge for a verified multi-role account', async () => {
    const secondRole = { roleAssignmentId: 'role-2', roleCode: 'OPERATOR', siteId: null } as const;
    const { issueRoleSelection, service } = createService();
    issueRoleSelection.mockResolvedValue({
      expiresAt: new Date('2026-07-22T04:05:00.000Z'),
      roles: [role, secondRole],
      token: 'selection-challenge',
    });

    await expect(
      service.completeVerifiedAccount({ roles: [role, secondRole], userId: 'user-1' }),
    ).resolves.toEqual({
      expiresAt: new Date('2026-07-22T04:05:00.000Z'),
      kind: 'ROLE_SELECTION_REQUIRED',
      roles: [role, secondRole],
      roleSelectionChallenge: 'selection-challenge',
    });
    expect(issueRoleSelection).toHaveBeenCalledWith('user-1');
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
