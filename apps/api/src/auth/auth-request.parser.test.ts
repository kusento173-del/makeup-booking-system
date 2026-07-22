import { describe, expect, it } from 'vitest';

import {
  AuthRequestInvalidError,
  parseAccountBindingRequest,
  parseBackofficeLoginRequest,
  parseBackofficePasswordChangeRequest,
  parseRefreshRequest,
  parseRoleSelectionRequest,
  parseWechatLoginRequest,
} from './auth-request.parser';

describe('auth request parsers', () => {
  it('normalizes a strict WeChat login request', () => {
    expect(parseWechatLoginRequest({ code: '  wx-code  ' })).toBe('wx-code');
  });

  it('keeps the password exact while normalizing the backoffice login name later', () => {
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

  it('parses only the fields required by each binding role', () => {
    expect(
      parseAccountBindingRequest(
        {
          bindingChallenge: 'challenge-1',
          bindingCode: 'ABCD-EFGH',
          target: { hostCode: ' ZB01842 ', roleCode: 'HOST' },
        },
        { clientType: 'WECHAT_MINIPROGRAM' },
      ),
    ).toEqual({
      bindingChallenge: 'challenge-1',
      bindingCode: 'ABCD-EFGH',
      clientType: 'WECHAT_MINIPROGRAM',
      target: { hostCode: 'ZB01842', roleCode: 'HOST' },
    });

    expect(() =>
      parseAccountBindingRequest(
        {
          bindingChallenge: 'challenge-1',
          bindingCode: 'ABCD-EFGH',
          target: { nickname: '柔柔', roleCode: 'HOST' },
        },
        {},
      ),
    ).toThrow(AuthRequestInvalidError);
  });
});
