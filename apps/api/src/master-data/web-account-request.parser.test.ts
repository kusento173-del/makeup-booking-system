import { describe, expect, it } from 'vitest';

import { MasterDataRequestInvalidError } from './master-data-request.parser';
import {
  parseProvisionProfileAccountRequest,
  parseResetWebAccountPasswordRequest,
} from './web-account-request.parser';

const profileId = '019f7a17-6845-7a90-94cb-e5f5caabd5f6';

describe('web account request parser', () => {
  it('allows a host account to omit its login name so the host code can be used', () => {
    expect(
      parseProvisionProfileAccountRequest({
        profileId,
        roleCode: 'HOST',
        temporaryPassword: 'temporary password',
      }),
    ).toEqual({
      profileId,
      roleCode: 'HOST',
      temporaryPassword: 'temporary password',
    });
  });

  it('accepts an artist account without a client-supplied login name', () => {
    expect(
      parseProvisionProfileAccountRequest({
        profileId,
        roleCode: 'ARTIST',
        temporaryPassword: 'temporary password',
      }),
    ).toEqual({
      profileId,
      roleCode: 'ARTIST',
      temporaryPassword: 'temporary password',
    });
  });

  it('rejects client-supplied profile login names', () => {
    expect(() =>
      parseProvisionProfileAccountRequest({
        loginName: 'artist.one',
        profileId,
        roleCode: 'ARTIST',
        temporaryPassword: 'temporary password',
      }),
    ).toThrow(MasterDataRequestInvalidError);
  });

  it('requires the reset target role and profile identifier', () => {
    expect(
      parseResetWebAccountPasswordRequest({
        profileId,
        reason: '本人忘记密码',
        roleCode: 'OPERATOR',
        temporaryPassword: 'temporary password',
      }),
    ).toEqual({
      profileId,
      reason: '本人忘记密码',
      roleCode: 'OPERATOR',
      temporaryPassword: 'temporary password',
    });
    expect(() =>
      parseResetWebAccountPasswordRequest({
        profileId,
        reason: '本人忘记密码',
        temporaryPassword: 'temporary password',
      }),
    ).toThrow(MasterDataRequestInvalidError);
  });
});
