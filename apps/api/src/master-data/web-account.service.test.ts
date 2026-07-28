import type { Prisma } from '@makeup/database';
import { describe, expect, it, vi } from 'vitest';

import type { AuditCommandService } from '../audit/audit-command.service';
import { AuthorizationPolicyService } from '../auth/authorization-policy.service';
import type { PasswordHasherService } from '../auth/password-hasher.service';
import type { DatabaseService } from '../database/database.service';
import type { MasterDataCommandContext } from './master-data-command.types';
import { WebAccountService } from './web-account.service';

const context: MasterDataCommandContext = {
  actorName: '管理员',
  clientType: 'ADMIN_WEB',
  requestId: 'request-1',
  roleAssignmentId: 'role-admin',
  roleCode: 'ADMIN',
  siteId: null,
  userId: 'user-admin',
};

function createService(transaction: object) {
  const append = vi.fn().mockResolvedValue('audit-1');
  const hash = vi.fn().mockResolvedValue('password-hash');
  const database = {
    transaction: vi.fn((operation: (value: Prisma.TransactionClient) => unknown) =>
      operation(transaction as Prisma.TransactionClient),
    ),
  };
  return {
    append,
    service: new WebAccountService(
      { append } as unknown as AuditCommandService,
      new AuthorizationPolicyService(),
      database as unknown as DatabaseService,
      { hash } as unknown as PasswordHasherService,
    ),
  };
}

describe('WebAccountService', () => {
  it.each([
    ['ARTIST', 'ma', 60],
    ['OPERATOR', 'op', 125],
  ] as const)(
    'generates the next immutable sequential login for %s accounts',
    async (roleCode, prefix, nextNumber) => {
      const transaction = {
        $queryRaw: vi.fn().mockResolvedValue([{ acquired: 1 }]),
        appUser: { create: vi.fn().mockResolvedValue({ id: 'user-new' }) },
        artistProfile: {
          findUnique: vi.fn().mockResolvedValue({
            nickname: '测试化妆师',
            siteId: 'site-1',
            userId: null,
          }),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        operatorProfile: {
          findUnique: vi.fn().mockResolvedValue({
            realName: '测试运营',
            siteId: 'site-1',
            userId: null,
          }),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        passwordCredential: { create: vi.fn().mockResolvedValue({}) },
        userIdentity: {
          create: vi.fn().mockResolvedValue({}),
          findMany: vi
            .fn()
            .mockResolvedValue(
              prefix === 'ma'
                ? [
                    { externalSubject: 'ma0001' },
                    { externalSubject: 'ma0059' },
                    { externalSubject: 'manual-artist' },
                  ]
                : [
                    { externalSubject: 'op0001' },
                    { externalSubject: 'op0124' },
                    { externalSubject: 'operator.old' },
                  ],
            ),
          findUnique: vi.fn().mockResolvedValue(null),
        },
        userRole: { create: vi.fn().mockResolvedValue({ id: 'role-new' }) },
      };
      const { append, service } = createService(transaction);
      const expectedLoginName = `${prefix}${String(nextNumber).padStart(4, '0')}`;

      await expect(
        service.provisionProfile(context, {
          profileId: '019f7a17-6845-7a90-94cb-e5f5caabd5f6',
          roleCode,
          temporaryPassword: 'temporary password',
        }),
      ).resolves.toEqual({ loginName: expectedLoginName, userId: 'user-new' });

      expect(transaction.$queryRaw).toHaveBeenCalledTimes(2);
      expect(transaction.userIdentity.create).toHaveBeenCalledWith({
        data: {
          externalSubject: expectedLoginName,
          provider: 'PASSWORD',
          providerAppId: 'BACKOFFICE',
          userId: 'user-new',
        },
      });
      expect(append).toHaveBeenCalledOnce();
      expect(JSON.stringify(append.mock.calls[0])).toContain(expectedLoginName);
      expect(JSON.stringify(append.mock.calls[0])).toContain(roleCode);
    },
  );

  it('uses the host code as the host login without consuming a sequence number', async () => {
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([{ acquired: 1 }]),
      appUser: { create: vi.fn().mockResolvedValue({ id: 'user-host' }) },
      hostProfile: {
        findUnique: vi.fn().mockResolvedValue({
          hostCode: ' 000001 ',
          realName: '阿伟',
          siteId: 'site-1',
          userId: null,
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      passwordCredential: { create: vi.fn().mockResolvedValue({}) },
      userIdentity: {
        create: vi.fn().mockResolvedValue({}),
        findMany: vi.fn(),
        findUnique: vi.fn().mockResolvedValue(null),
      },
      userRole: { create: vi.fn().mockResolvedValue({ id: 'role-host' }) },
    };
    const { service } = createService(transaction);

    await expect(
      service.provisionProfile(context, {
        profileId: '019f7a17-6845-7a90-94cb-e5f5caabd5f6',
        roleCode: 'HOST',
        temporaryPassword: 'temporary password',
      }),
    ).resolves.toEqual({ loginName: '000001', userId: 'user-host' });
    expect(transaction.$queryRaw).toHaveBeenCalledTimes(1);
    expect(transaction.userIdentity.findMany).not.toHaveBeenCalled();
  });
});
