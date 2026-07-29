import type { Prisma } from '@makeup/database';
import { describe, expect, it, vi } from 'vitest';

import type { DatabaseService } from '../database/database.service';
import type { VerifiedAuthorizationContext } from './authorization.types';
import { CurrentProfileService } from './current-profile.service';

const baseUser = {
  artistProfile: null,
  displayName: '阿伟',
  hostProfile: null,
  identities: [{ externalSubject: '000001' }],
  operatorProfile: null,
};

function serviceFor(user: object) {
  const findUniqueOrThrow = vi.fn().mockResolvedValue(user);
  const database = {
    read: vi.fn((operation: (client: Prisma.TransactionClient) => unknown) =>
      operation({ appUser: { findUniqueOrThrow } } as unknown as Prisma.TransactionClient),
    ),
  };
  return {
    findUniqueOrThrow,
    service: new CurrentProfileService(database as unknown as DatabaseService),
  };
}

function context(roleCode: VerifiedAuthorizationContext['roleCode']) {
  return { roleAssignmentId: 'role-1', roleCode, siteId: 'site-1', userId: 'user-1' };
}

describe('CurrentProfileService', () => {
  it('returns the host code as the host account information', async () => {
    const { service } = serviceFor({
      ...baseUser,
      hostProfile: {
        hostCode: '000001',
        nickname: null,
        realName: '阿伟',
        site: { id: 'site-1', name: '松江' },
      },
    });

    await expect(service.get(context('HOST'))).resolves.toEqual({
      account: '000001',
      displayName: '阿伟',
      hostCode: '000001',
      personName: '阿伟',
      roleCode: 'HOST',
      siteId: 'site-1',
      siteName: '松江',
    });
  });

  it.each([
    [
      'ARTIST' as const,
      {
        ...baseUser,
        artistProfile: {
          nickname: '阿伟-松江化妆师',
          realName: '阿伟',
          site: { id: 'site-1', name: '松江' },
        },
        identities: [{ externalSubject: 'MA000001' }],
      },
      '阿伟-松江化妆师',
      'MA000001',
    ],
    [
      'OPERATOR' as const,
      {
        ...baseUser,
        identities: [{ externalSubject: 'OP000001' }],
        operatorProfile: {
          realName: '阿伟-松江运营',
          site: { id: 'site-1', name: '松江' },
        },
      },
      '阿伟-松江运营',
      'OP000001',
    ],
  ])('returns the linked %s profile', async (roleCode, user, personName, account) => {
    const { service } = serviceFor(user);

    await expect(service.get(context(roleCode))).resolves.toMatchObject({
      account,
      personName,
      roleCode,
      siteName: '松江',
    });
  });
});
