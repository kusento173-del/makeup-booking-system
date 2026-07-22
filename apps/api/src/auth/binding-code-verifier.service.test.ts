import type { Prisma } from '@makeup/database';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BindingCodeHasherService } from './binding-code-hasher.service';
import { BindingCodeVerifierService } from './binding-code-verifier.service';

function activeCode(hasher: BindingCodeHasherService) {
  return {
    codeHash: hasher.hash('ABCD-EFGH'),
    expiresAt: new Date('2026-07-23T04:00:00.000Z'),
    failedAttemptCount: 1,
    id: 'binding-code-1',
    maxAttempts: 5,
    rowVersion: 2,
    siteId: 'site-songjiang',
  };
}

describe('BindingCodeVerifierService', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('atomically consumes a valid code for the target user', async () => {
    vi.stubEnv('AUTH_BINDING_CODE_PEPPER', 'test-pepper-with-at-least-32-characters');
    const now = new Date('2026-07-22T04:00:00.000Z');
    vi.useFakeTimers({ now });
    const hasher = new BindingCodeHasherService();
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const transaction = {
      accountBindingCode: {
        findFirst: vi.fn().mockResolvedValue(activeCode(hasher)),
        updateMany,
      },
    };
    const service = new BindingCodeVerifierService(hasher);

    await expect(
      service.tryConsume(transaction as unknown as Prisma.TransactionClient, {
        code: 'abcd efgh',
        consumerUserId: 'user-1',
        profileId: 'host-1',
        roleCode: 'HOST',
      }),
    ).resolves.toEqual({
      bindingCodeId: 'binding-code-1',
      profileId: 'host-1',
      roleCode: 'HOST',
      siteId: 'site-songjiang',
    });

    expect(updateMany).toHaveBeenCalledWith({
      data: {
        consumedAt: now,
        consumedByUserId: 'user-1',
        rowVersion: { increment: 1 },
      },
      where: {
        codeHash: hasher.hash('ABCD-EFGH'),
        consumedAt: null,
        expiresAt: { gt: now },
        failedAttemptCount: { lt: 5 },
        id: 'binding-code-1',
        revokedAt: null,
        rowVersion: 2,
      },
    });
  });

  it('counts a wrong attempt and returns a failure result that can be committed', async () => {
    vi.stubEnv('AUTH_BINDING_CODE_PEPPER', 'test-pepper-with-at-least-32-characters');
    vi.useFakeTimers({ now: new Date('2026-07-22T04:00:00.000Z') });
    const hasher = new BindingCodeHasherService();
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const transaction = {
      accountBindingCode: {
        findFirst: vi.fn().mockResolvedValue(activeCode(hasher)),
        updateMany,
      },
    };
    const service = new BindingCodeVerifierService(hasher);

    await expect(
      service.tryConsume(transaction as unknown as Prisma.TransactionClient, {
        code: 'ABCD-EFGJ',
        consumerUserId: 'user-1',
        profileId: 'host-1',
        roleCode: 'HOST',
      }),
    ).resolves.toBeNull();
    expect(updateMany).toHaveBeenCalledWith({
      data: {
        failedAttemptCount: { increment: 1 },
        rowVersion: { increment: 1 },
      },
      where: {
        consumedAt: null,
        failedAttemptCount: { lt: 5 },
        id: 'binding-code-1',
        revokedAt: null,
      },
    });
  });

  it('does not mutate expired or exhausted codes', async () => {
    vi.stubEnv('AUTH_BINDING_CODE_PEPPER', 'test-pepper-with-at-least-32-characters');
    vi.useFakeTimers({ now: new Date('2026-07-24T04:00:00.000Z') });
    const hasher = new BindingCodeHasherService();
    const updateMany = vi.fn();
    const transaction = {
      accountBindingCode: {
        findFirst: vi.fn().mockResolvedValue(activeCode(hasher)),
        updateMany,
      },
    };
    const service = new BindingCodeVerifierService(hasher);

    await expect(
      service.tryConsume(transaction as unknown as Prisma.TransactionClient, {
        code: 'ABCD-EFGH',
        consumerUserId: 'user-1',
        profileId: 'host-1',
        roleCode: 'HOST',
      }),
    ).resolves.toBeNull();
    expect(updateMany).not.toHaveBeenCalled();
  });
});
