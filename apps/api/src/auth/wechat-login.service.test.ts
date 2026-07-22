import type { Prisma } from '@makeup/database';
import { describe, expect, it, vi } from 'vitest';

import type { DatabaseService } from '../database/database.service';
import type { BindingChallengeService } from './binding-challenge.service';
import { WechatLoginService } from './wechat-login.service';

const identity = {
  externalSubject: 'openid-1',
  providerAppId: 'wx-test-app',
  unionId: 'union-1',
};

function createService(transaction: object) {
  const issue = vi.fn().mockResolvedValue({
    expiresAt: new Date('2026-07-22T05:10:00.000Z'),
    token: 'binding-challenge',
  });
  const database = {
    transaction: vi.fn((operation: (value: Prisma.TransactionClient) => unknown) =>
      operation(transaction as Prisma.TransactionClient),
    ),
  };
  const exchangeCode = vi.fn().mockResolvedValue(identity);
  const service = new WechatLoginService(
    { issue } as unknown as BindingChallengeService,
    database as unknown as DatabaseService,
    { exchangeCode },
  );

  return { exchangeCode, issue, service };
}

describe('WechatLoginService', () => {
  it('recognizes a bound account and exposes all active roles for selection', async () => {
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([{ pg_advisory_xact_lock: null }]),
      userIdentity: {
        findUnique: vi.fn().mockResolvedValue({
          status: 'ACTIVE',
          user: {
            id: 'user-1',
            roles: [
              { id: 'role-host', roleCode: 'HOST', siteId: null },
              { id: 'role-operator', roleCode: 'OPERATOR', siteId: null },
            ],
            status: 'ACTIVE',
          },
        }),
      },
    };
    const { issue, service } = createService(transaction);

    await expect(service.login('js-code')).resolves.toEqual({
      kind: 'ACCOUNT_RECOGNIZED',
      requiresRoleSelection: true,
      roles: [
        { roleAssignmentId: 'role-host', roleCode: 'HOST', siteId: null },
        { roleAssignmentId: 'role-operator', roleCode: 'OPERATOR', siteId: null },
      ],
      userId: 'user-1',
    });
    expect(issue).not.toHaveBeenCalled();
  });

  it('creates a pending account and server-held identity before returning a binding challenge', async () => {
    const createUser = vi.fn().mockResolvedValue({ id: 'user-new' });
    const createIdentity = vi.fn().mockResolvedValue({ id: 'identity-new' });
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([{ pg_advisory_xact_lock: null }]),
      appUser: { create: createUser },
      userIdentity: { create: createIdentity, findUnique: vi.fn().mockResolvedValue(null) },
    };
    const { issue, service } = createService(transaction);

    await expect(service.login('js-code')).resolves.toEqual({
      bindingChallenge: 'binding-challenge',
      bindingChallengeExpiresAt: new Date('2026-07-22T05:10:00.000Z'),
      kind: 'BINDING_REQUIRED',
    });
    expect(createUser).toHaveBeenCalledWith({
      data: { displayName: '待绑定用户', status: 'PENDING_BINDING' },
      select: { id: true },
    });
    expect(createIdentity).toHaveBeenCalledWith({
      data: {
        externalSubject: 'openid-1',
        provider: 'WECHAT_MINIPROGRAM',
        providerAppId: 'wx-test-app',
        unionId: 'union-1',
        userId: 'user-new',
      },
    });
    expect(issue).toHaveBeenCalledWith(transaction, 'user-new');
  });
});
