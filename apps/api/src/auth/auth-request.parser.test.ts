import { describe, expect, it } from 'vitest';

import {
  AuthRequestInvalidError,
  parseBackofficeLoginRequest,
  parseBackofficePasswordChangeRequest,
  parseRefreshRequest,
  parseRoleSelectionRequest,
} from './auth-request.parser';

describe('auth request parsers', () => {
  it('keeps the password exact while normalizing the login name', () => {
    expect(
      parseBackofficeLoginRequest({ loginName: ' Admin.User ', password: '  pass phrase  ' }),
    ).toEqual({ loginName: 'Admin.User', password: '  pass phrase  ' });
  });

  it('accepts only the two password-change fields and preserves both values', () => {
    expect(
      parseBackofficePasswordChangeRequest({
        currentPassword: ' current password ',
        newPassword: ' next password ',
      }),
    ).toEqual({ currentPassword: ' current password ', newPassword: ' next password ' });
    expect(() =>
      parseBackofficePasswordChangeRequest({
        currentPassword: 'current password',
        newPassword: 'next password',
        userId: 'forged-user',
      }),
    ).toThrow(AuthRequestInvalidError);
  });

  it('rejects unknown fields and malformed refresh requests', () => {
    expect(() => parseRefreshRequest({ refreshToken: 'token', userId: 'forged' })).toThrow(
      AuthRequestInvalidError,
    );
    expect(() => parseRefreshRequest({ refreshToken: '' })).toThrow(AuthRequestInvalidError);
  });

  it('requires both opaque proof and selected role for role selection', () => {
    expect(
      parseRoleSelectionRequest({
        roleAssignmentId: 'role-1',
        roleSelectionChallenge: 'challenge-1',
      }),
    ).toEqual({ roleAssignmentId: 'role-1', roleSelectionChallenge: 'challenge-1' });
  });
});
