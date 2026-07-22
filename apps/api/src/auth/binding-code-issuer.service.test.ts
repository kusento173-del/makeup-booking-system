import type { Prisma } from '@makeup/database';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AuditCommandService } from '../audit/audit-command.service';
import type { DatabaseService } from '../database/database.service';
import {
  AuthorizationDeniedError,
  AuthorizationPolicyService,
} from './authorization-policy.service';
import { BindingTargetUnavailableError } from './binding-code.errors';
import { BindingCodeHasherService } from './binding-code-hasher.service';
import { BindingCodeIssuerService } from './binding-code-issuer.service';
import type { BindingCodeCommandContext } from './binding-code.types';

const context: BindingCodeCommandContext = {
  actorName: '松江客服',
  clientType: 'ADMIN_WEB',
  requestId: 'request-1',
  roleAssignmentId: 'role-1',
  roleCode: 'CUSTOMER_SERVICE',
  siteId: 'site-songjiang',
  userId: 'user-customer-service',
};

function createService(transaction: object) {
  const append = vi.fn().mockResolvedValue('log-1');
  const database = {
    transaction: vi.fn((operation: (value: Prisma.TransactionClient) => unknown) =>
      operation(transaction as Prisma.TransactionClient),
    ),
  };
  const hasher = new BindingCodeHasherService();
  const service = new BindingCodeIssuerService(
    { append } as unknown as AuditCommandService,
    new AuthorizationPolicyService(),
    database as unknown as DatabaseService,
    hasher,
  );

  return { append, database, hasher, service };
}

describe('BindingCodeIssuerService', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('replaces the current code and returns new plaintext only once', async () => {
    vi.stubEnv('AUTH_BINDING_CODE_PEPPER', 'test-pepper-with-at-least-32-characters');
    const now = new Date('2026-07-22T03:00:00.000Z');
    vi.useFakeTimers({ now });
    const create = vi.fn().mockResolvedValue({ id: 'binding-code-1' });
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const transaction = {
      accountBindingCode: { create, updateMany },
      hostProfile: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'host-1',
          qualificationStatus: 'ACTIVE',
          site: { status: 'ACTIVE' },
          siteId: 'site-songjiang',
          userId: null,
        }),
      },
    };
    const { append, hasher, service } = createService(transaction);

    const result = await service.issue(context, { profileId: 'host-1', roleCode: 'HOST' });
    const expiresAt = new Date('2026-07-23T03:00:00.000Z');

    expect(result).toEqual({
      bindingCodeId: 'binding-code-1',
      code: result.code,
      expiresAt,
      profileId: 'host-1',
      roleCode: 'HOST',
      siteId: 'site-songjiang',
    });
    expect(result.code).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    expect(updateMany).toHaveBeenCalledWith({
      data: {
        revokeReason: '重新签发',
        revokedAt: now,
        revokedByUserId: 'user-customer-service',
        rowVersion: { increment: 1 },
      },
      where: { consumedAt: null, hostProfileId: 'host-1', revokedAt: null },
    });
    expect(create).toHaveBeenCalledWith({
      data: {
        codeHash: hasher.hash(result.code),
        createdByUserId: 'user-customer-service',
        expiresAt,
        hostProfileId: 'host-1',
        roleCode: 'HOST',
        siteId: 'site-songjiang',
      },
      select: { id: true },
    });
    expect(append).toHaveBeenCalledWith(
      transaction,
      context,
      expect.objectContaining({
        action: 'BINDING_CODE_ISSUED',
        afterData: {
          expiresAt: expiresAt.toISOString(),
          profileId: 'host-1',
          replacedCodeCount: 1,
          roleCode: 'HOST',
        },
        objectId: 'binding-code-1',
        siteId: 'site-songjiang',
      }),
    );
  });

  it('prevents customer service from issuing codes across sites', async () => {
    const updateMany = vi.fn();
    const transaction = {
      accountBindingCode: { updateMany },
      operatorProfile: {
        findUnique: vi.fn().mockResolvedValue({
          employmentStatus: 'ACTIVE',
          id: 'operator-1',
          site: { status: 'ACTIVE' },
          siteId: 'site-wuxi',
          userId: null,
        }),
      },
    };
    const { service } = createService(transaction);

    await expect(
      service.issue(context, { profileId: 'operator-1', roleCode: 'OPERATOR' }),
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('rejects an inactive or already-bound profile before issuing a code', async () => {
    const updateMany = vi.fn();
    const transaction = {
      accountBindingCode: { updateMany },
      artistProfile: {
        findUnique: vi.fn().mockResolvedValue({
          employmentStatus: 'INACTIVE',
          id: 'artist-1',
          site: { status: 'ACTIVE' },
          siteId: 'site-songjiang',
          userId: null,
        }),
      },
    };
    const { service } = createService(transaction);

    await expect(
      service.issue(context, { profileId: 'artist-1', roleCode: 'ARTIST' }),
    ).rejects.toBeInstanceOf(BindingTargetUnavailableError);
    expect(updateMany).not.toHaveBeenCalled();
  });
});
