import type { Prisma } from '@makeup/database';
import { describe, expect, it, vi } from 'vitest';

import { AuditCommandService } from '../audit/audit-command.service';
import { AuditEntryFactory } from '../audit/audit-entry.factory';
import { AuditSnapshotSanitizerService } from '../audit/audit-snapshot-sanitizer.service';
import { AuthorizationDeniedError } from '../auth/authorization-policy.service';
import { AuthorizationPolicyService } from '../auth/authorization-policy.service';
import type { DatabaseService } from '../database/database.service';
import type { MasterDataCommandContext } from './master-data-command.types';
import { MasterDataCreateService } from './master-data-create.service';
import { MasterDataSiteMismatchError } from './master-data.errors';
import { MasterDataNormalizationService } from './master-data-normalization.service';

const context: MasterDataCommandContext = {
  actorName: '松江客服',
  clientType: 'ADMIN_WEB',
  requestId: 'request-1',
  roleAssignmentId: 'role-1',
  roleCode: 'CUSTOMER_SERVICE',
  siteId: 'site-songjiang',
  userId: 'user-1',
};

function createService(transaction: object) {
  const append = vi.fn().mockResolvedValue('log-1');
  const database = {
    transaction: vi.fn((operation: (value: Prisma.TransactionClient) => unknown) =>
      operation(transaction as Prisma.TransactionClient),
    ),
  };
  const service = new MasterDataCreateService(
    new AuditCommandService(new AuditEntryFactory(new AuditSnapshotSanitizerService()), {
      append,
    }),
    new AuthorizationPolicyService(),
    database as unknown as DatabaseService,
    new MasterDataNormalizationService(),
  );

  return { append, database, service };
}

describe('MasterDataCreateService', () => {
  it('creates a host and appends its audit in the same caller transaction', async () => {
    const qualificationEffectiveAt = new Date('2026-07-22T01:00:00.000Z');
    vi.useFakeTimers({ now: qualificationEffectiveAt });
    const create = vi.fn().mockResolvedValue({
      hostCode: 'ZB0001',
      id: 'host-1',
      nickname: null,
      qualificationStatus: 'ACTIVE',
      realName: '主播一',
      siteId: 'site-songjiang',
    });
    const createQualificationHistory = vi.fn().mockResolvedValue({ id: 'history-1' });
    const transaction = {
      hostProfile: { create, findUnique: vi.fn().mockResolvedValue(null) },
      hostQualificationHistory: { create: createQualificationHistory },
      site: { findUnique: vi.fn().mockResolvedValue({ status: 'ACTIVE' }) },
    };
    const { append, service } = createService(transaction);

    try {
      await expect(
        service.createHost(context, {
          hostCode: ' zb0001 ',
          realName: ' 主播一 ',
          siteId: 'site-songjiang',
        }),
      ).resolves.toBe('host-1');
    } finally {
      vi.useRealTimers();
    }

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          hostCode: 'ZB0001',
          nickname: null,
          qualificationEffectiveAt,
          realName: '主播一',
          siteId: 'site-songjiang',
        },
      }),
    );
    expect(createQualificationHistory).toHaveBeenCalledWith({
      data: {
        changedByUserId: 'user-1',
        effectiveAt: qualificationEffectiveAt,
        hostId: 'host-1',
        toStatus: 'ACTIVE',
      },
    });
    expect(append).toHaveBeenCalledWith(
      transaction,
      expect.objectContaining({
        action: 'HOST_CREATED',
        actorRole: 'CUSTOMER_SERVICE',
        objectId: 'host-1',
        siteId: 'site-songjiang',
      }),
    );
  });

  it('restores a deleted host when the same business code is added again', async () => {
    const deletedAt = new Date('2026-07-27T01:00:00.000Z');
    const restoredAt = new Date('2026-07-28T02:00:00.000Z');
    vi.useFakeTimers({ now: restoredAt });
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const createQualificationHistory = vi.fn().mockResolvedValue({ id: 'history-2' });
    const transaction = {
      appUser: { update: vi.fn().mockResolvedValue({}) },
      hostProfile: {
        create: vi.fn(),
        findUnique: vi.fn().mockResolvedValue({
          deletedAt,
          hostCode: '10141',
          id: 'host-1',
          nickname: null,
          qualificationStatus: 'CANCELLED',
          realName: '熊澳',
          rowVersion: 4,
          siteId: 'site-songjiang',
          userId: 'host-user',
        }),
        updateMany,
      },
      hostQualificationHistory: { create: createQualificationHistory },
      site: { findUnique: vi.fn().mockResolvedValue({ status: 'ACTIVE' }) },
      userRole: {
        create: vi.fn().mockResolvedValue({ id: 'new-host-role' }),
        findFirst: vi.fn().mockResolvedValue(null),
      },
    };
    const { append, service } = createService(transaction);

    try {
      await expect(
        service.createHost(context, {
          hostCode: '10141',
          nickname: '小熊',
          realName: '熊澳',
          siteId: 'site-songjiang',
        }),
      ).resolves.toBe('host-1');
    } finally {
      vi.useRealTimers();
    }

    expect(updateMany).toHaveBeenCalledWith({
      data: {
        deletedAt: null,
        hostCode: '10141',
        nickname: '小熊',
        qualificationEffectiveAt: restoredAt,
        qualificationStatus: 'ACTIVE',
        qualificationValidUntil: null,
        realName: '熊澳',
        rowVersion: { increment: 1 },
        siteId: 'site-songjiang',
      },
      where: { deletedAt: { not: null }, id: 'host-1', rowVersion: 4 },
    });
    expect(transaction.appUser.update).toHaveBeenCalledWith({
      data: { rowVersion: { increment: 1 }, status: 'ACTIVE' },
      where: { id: 'host-user' },
    });
    expect(transaction.userRole.create).toHaveBeenCalledWith({
      data: {
        assignedByUserId: 'user-1',
        roleCode: 'HOST',
        siteId: 'site-songjiang',
        userId: 'host-user',
      },
    });
    expect(createQualificationHistory).toHaveBeenCalledWith({
      data: {
        changedByUserId: 'user-1',
        effectiveAt: restoredAt,
        fromStatus: 'CANCELLED',
        hostId: 'host-1',
        reason: '人员重新新增',
        toStatus: 'ACTIVE',
      },
    });
    expect(transaction.hostProfile.create).not.toHaveBeenCalled();
    expect(append).toHaveBeenCalledWith(
      transaction,
      expect.objectContaining({ action: 'HOST_RESTORED', objectId: 'host-1' }),
    );
  });

  it('rejects a customer-service cross-site create before opening a transaction', () => {
    const { database, service } = createService({});

    expect(() =>
      service.createHost(context, {
        hostCode: 'ZB0002',
        realName: '主播二',
        siteId: 'site-wuxi',
      }),
    ).toThrow(AuthorizationDeniedError);
    expect(database.transaction).not.toHaveBeenCalled();
  });

  it('normalizes artist nicknames before persistence', async () => {
    const create = vi.fn().mockResolvedValue({
      employmentStatus: 'ACTIVE',
      id: 'artist-1',
      nickname: '柔柔',
      realName: '化妆师一',
      siteId: 'site-songjiang',
    });
    const { service } = createService({
      artistProfile: { create },
      site: { findUnique: vi.fn().mockResolvedValue({ status: 'ACTIVE' }) },
    });

    await service.createArtist(context, {
      nickname: ' 柔柔 ',
      realName: '化妆师一',
      siteId: 'site-songjiang',
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        nickname: '柔柔',
        nicknameNormalized: '柔柔',
        realName: '化妆师一',
        siteId: 'site-songjiang',
      },
      select: {
        employmentStatus: true,
        id: true,
        nickname: true,
        realName: true,
        siteId: true,
      },
    });
  });

  it('rejects cross-site host and operator relationships', async () => {
    const transaction = {
      hostOperatorRelation: { create: vi.fn() },
      hostProfile: {
        findUnique: vi.fn().mockResolvedValue({
          hostCode: 'ZB0001',
          id: 'host-1',
          siteId: 'site-songjiang',
        }),
      },
      operatorProfile: {
        findUnique: vi.fn().mockResolvedValue({
          employmentStatus: 'ACTIVE',
          id: 'operator-1',
          realName: '运营一',
          siteId: 'site-wuxi',
        }),
      },
    };
    const { service } = createService(transaction);

    await expect(
      service.assignOperator(context, {
        hostId: 'host-1',
        operatorId: 'operator-1',
        validFrom: new Date('2026-07-22T00:00:00.000Z'),
      }),
    ).rejects.toBeInstanceOf(MasterDataSiteMismatchError);
    expect(transaction.hostOperatorRelation.create).not.toHaveBeenCalled();
  });

  it('allows only administrators to create sites', () => {
    const { service } = createService({});

    expect(() => service.createSite(context, { code: 'TEST', name: '测试场地' })).toThrow(
      AuthorizationDeniedError,
    );
  });
});
