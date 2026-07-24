import type { Prisma } from '@makeup/database';
import { describe, expect, it, vi } from 'vitest';

import type { AuditCommandService } from '../audit/audit-command.service';
import type { DatabaseService } from '../database/database.service';
import { AccountBindingService } from './account-binding.service';
import type { BindingChallengeService } from './binding-challenge.service';
import { BindingCodeInvalidError } from './binding-code.errors';
import type { BindingCodeVerifierService } from './binding-code-verifier.service';

function createService(transaction: object, consumedCode: object | null) {
  const append = vi.fn().mockResolvedValue('log-1');
  const consumeChallenge = vi.fn().mockResolvedValue(true);
  const resolve = vi.fn().mockResolvedValue({
    challengeId: 'challenge-1',
    userId: 'user-1',
    userStatus: 'PENDING_BINDING',
  });
  const tryConsume = vi.fn().mockResolvedValue(consumedCode);
  const database = {
    transaction: vi.fn((operation: (value: Prisma.TransactionClient) => unknown) =>
      operation(transaction as Prisma.TransactionClient),
    ),
  };
  const service = new AccountBindingService(
    { append } as unknown as AuditCommandService,
    { consume: consumeChallenge, resolve } as unknown as BindingChallengeService,
    { tryConsume } as unknown as BindingCodeVerifierService,
    database as unknown as DatabaseService,
  );

  return { append, consumeChallenge, resolve, service, tryConsume };
}

describe('AccountBindingService', () => {
  it('binds the profile, role, account, code and challenge in one transaction', async () => {
    const updateProfile = vi.fn().mockResolvedValue({ count: 1 });
    const transaction = {
      appUser: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      hostProfile: {
        findUnique: vi.fn().mockResolvedValue({
          hostCode: 'ZB0001',
          id: 'host-1',
          qualificationStatus: 'ACTIVE',
          realName: '主播一',
          rowVersion: 2,
          site: { status: 'ACTIVE' },
          siteId: 'site-songjiang',
          userId: null,
        }),
        updateMany: updateProfile,
      },
      userRole: {
        create: vi.fn().mockResolvedValue({ id: 'role-1' }),
        findMany: vi
          .fn()
          .mockResolvedValue([{ id: 'role-1', roleCode: 'HOST', siteId: 'site-songjiang' }]),
      },
    };
    const consumedCode = {
      bindingCodeId: 'code-1',
      profileId: 'host-1',
      roleCode: 'HOST',
      siteId: 'site-songjiang',
    };
    const { append, consumeChallenge, service } = createService(transaction, consumedCode);

    await expect(
      service.bind({
        bindingChallenge: 'challenge-token',
        bindingCode: 'ABCD-EFGH',
        clientType: 'MINI_PROGRAM',
        target: { hostCode: ' ZB0001 ', roleCode: 'HOST' },
      }),
    ).resolves.toEqual({
      requiresRoleSelection: false,
      roles: [{ roleAssignmentId: 'role-1', roleCode: 'HOST', siteId: 'site-songjiang' }],
      userId: 'user-1',
    });
    expect(transaction.userRole.create).toHaveBeenCalledWith({
      data: { roleCode: 'HOST', siteId: 'site-songjiang', userId: 'user-1' },
      select: { id: true },
    });
    expect(updateProfile).toHaveBeenCalledWith({
      data: { rowVersion: { increment: 1 }, userId: 'user-1' },
      where: { id: 'host-1', qualificationStatus: 'ACTIVE', rowVersion: 2, userId: null },
    });
    expect(consumeChallenge).toHaveBeenCalledOnce();
    expect(append).toHaveBeenCalledWith(
      transaction,
      expect.objectContaining({ actorName: '主播一', roleCode: 'HOST', userId: 'user-1' }),
      expect.objectContaining({ action: 'ACCOUNT_PROFILE_BOUND', objectId: 'user-1' }),
    );
  });

  it('returns one public error after a failed code attempt can commit', async () => {
    const updateProfile = vi.fn();
    const transaction = {
      hostProfile: {
        findUnique: vi.fn().mockResolvedValue({
          hostCode: 'ZB0001',
          id: 'host-1',
          qualificationStatus: 'ACTIVE',
          realName: '主播一',
          rowVersion: 2,
          site: { status: 'ACTIVE' },
          siteId: 'site-songjiang',
          userId: null,
        }),
        updateMany: updateProfile,
      },
    };
    const { service, tryConsume } = createService(transaction, null);

    await expect(
      service.bind({
        bindingChallenge: 'challenge-token',
        bindingCode: 'WRONG-CODE',
        target: { hostCode: 'ZB0001', roleCode: 'HOST' },
      }),
    ).rejects.toBeInstanceOf(BindingCodeInvalidError);
    expect(tryConsume).toHaveBeenCalledOnce();
    expect(updateProfile).not.toHaveBeenCalled();
  });
});
