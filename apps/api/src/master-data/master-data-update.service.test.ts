import type { Prisma } from '@makeup/database';
import { describe, expect, it, vi } from 'vitest';

import { AuditEntryFactory } from '../audit/audit-entry.factory';
import { AuditSnapshotSanitizerService } from '../audit/audit-snapshot-sanitizer.service';
import {
  AuthorizationDeniedError,
  AuthorizationPolicyService,
} from '../auth/authorization-policy.service';
import type { DatabaseService } from '../database/database.service';
import { MasterDataAuditService } from './master-data-audit.service';
import type { MasterDataCommandContext } from './master-data-command.types';
import { MasterDataInactiveSiteError, MasterDataVersionConflictError } from './master-data.errors';
import { MasterDataNormalizationService } from './master-data-normalization.service';
import { MasterDataUpdateService } from './master-data-update.service';

const customerServiceContext: MasterDataCommandContext = {
  actorName: '松江客服',
  clientType: 'ADMIN_WEB',
  requestId: 'request-1',
  roleAssignmentId: 'role-1',
  roleCode: 'CUSTOMER_SERVICE',
  siteId: 'site-songjiang',
  userId: 'user-1',
};

const adminContext: MasterDataCommandContext = {
  ...customerServiceContext,
  actorName: '管理员',
  roleCode: 'ADMIN',
  siteId: null,
};

function createService(transaction: object) {
  const append = vi.fn().mockResolvedValue('log-1');
  const database = {
    transaction: vi.fn((operation: (value: Prisma.TransactionClient) => unknown) =>
      operation(transaction as Prisma.TransactionClient),
    ),
  };
  const service = new MasterDataUpdateService(
    new MasterDataAuditService(new AuditEntryFactory(new AuditSnapshotSanitizerService()), {
      append,
    }),
    new AuthorizationPolicyService(),
    database as unknown as DatabaseService,
    new MasterDataNormalizationService(),
  );

  return { append, database, service };
}

describe('MasterDataUpdateService', () => {
  it('updates a host with optimistic locking and audits both snapshots', async () => {
    const before = {
      hostCode: 'ZB0001',
      id: 'host-1',
      nickname: null,
      qualificationStatus: 'ACTIVE' as const,
      realName: '主播一',
      rowVersion: 3,
      siteId: 'site-songjiang',
    };
    const after = { ...before, nickname: '小一', rowVersion: 4 };
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const transaction = {
      hostProfile: {
        findUnique: vi.fn().mockResolvedValue(before),
        findUniqueOrThrow: vi.fn().mockResolvedValue(after),
        updateMany,
      },
    };
    const { append, service } = createService(transaction);

    await expect(
      service.updateHost(customerServiceContext, {
        expectedRowVersion: 3,
        id: 'host-1',
        nickname: ' 小一 ',
        qualificationStatus: 'ACTIVE',
        realName: ' 主播一 ',
        reason: '补充昵称',
        siteId: 'site-songjiang',
      }),
    ).resolves.toBeUndefined();

    expect(updateMany).toHaveBeenCalledWith({
      data: {
        nickname: '小一',
        qualificationStatus: 'ACTIVE',
        realName: '主播一',
        rowVersion: { increment: 1 },
        siteId: 'site-songjiang',
      },
      where: { id: 'host-1', rowVersion: 3 },
    });
    expect(append).toHaveBeenCalledWith(
      transaction,
      expect.objectContaining({
        action: 'HOST_UPDATED',
        afterData: after,
        beforeData: before,
        objectId: 'host-1',
        reason: '补充昵称',
      }),
    );
  });

  it('rejects a stale row version without appending an audit entry', async () => {
    const transaction = {
      operatorProfile: {
        findUnique: vi.fn().mockResolvedValue({
          employmentStatus: 'ACTIVE',
          id: 'operator-1',
          realName: '运营一',
          rowVersion: 2,
          siteId: 'site-songjiang',
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const { append, service } = createService(transaction);

    await expect(
      service.updateOperator(customerServiceContext, {
        employmentStatus: 'ACTIVE',
        expectedRowVersion: 1,
        id: 'operator-1',
        realName: '运营一',
        reason: '修正姓名',
        siteId: 'site-songjiang',
      }),
    ).rejects.toBeInstanceOf(MasterDataVersionConflictError);
    expect(append).not.toHaveBeenCalled();
  });

  it('prevents customer service from moving master data across sites', async () => {
    const updateMany = vi.fn();
    const transaction = {
      artistProfile: {
        findUnique: vi.fn().mockResolvedValue({
          employmentStatus: 'ACTIVE',
          id: 'artist-1',
          nickname: '柔柔',
          realName: '化妆师一',
          rowVersion: 1,
          siteId: 'site-songjiang',
        }),
        updateMany,
      },
    };
    const { service } = createService(transaction);

    await expect(
      service.updateArtist(customerServiceContext, {
        employmentStatus: 'ACTIVE',
        expectedRowVersion: 1,
        id: 'artist-1',
        nickname: '柔柔',
        realName: '化妆师一',
        reason: '调动场地',
        siteId: 'site-wuxi',
      }),
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('prevents administrators from moving master data into an inactive site', async () => {
    const updateMany = vi.fn();
    const transaction = {
      hostProfile: {
        findUnique: vi.fn().mockResolvedValue({
          hostCode: 'ZB0001',
          id: 'host-1',
          nickname: null,
          qualificationStatus: 'ACTIVE',
          realName: '主播一',
          rowVersion: 1,
          siteId: 'site-songjiang',
        }),
        updateMany,
      },
      site: { findUnique: vi.fn().mockResolvedValue({ status: 'INACTIVE' }) },
    };
    const { service } = createService(transaction);

    await expect(
      service.updateHost(adminContext, {
        expectedRowVersion: 1,
        id: 'host-1',
        qualificationStatus: 'ACTIVE',
        realName: '主播一',
        reason: '调动场地',
        siteId: 'site-inactive',
      }),
    ).rejects.toBeInstanceOf(MasterDataInactiveSiteError);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('ends an operator assignment and audits its incremented row version', async () => {
    const before = {
      changeReason: '初始分配',
      host: { siteId: 'site-songjiang' },
      hostId: 'host-1',
      id: 'relation-1',
      operatorId: 'operator-1',
      rowVersion: 5,
      validFrom: new Date('2026-07-01T00:00:00.000Z'),
      validUntil: null,
    };
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const transaction = {
      hostOperatorRelation: {
        findUnique: vi.fn().mockResolvedValue(before),
        updateMany,
      },
    };
    const { append, service } = createService(transaction);
    const validUntil = new Date('2026-07-31T00:00:00.000Z');

    await expect(
      service.endOperatorAssignment(customerServiceContext, {
        expectedRowVersion: 5,
        id: 'relation-1',
        reason: '主播转组',
        validUntil,
      }),
    ).resolves.toBeUndefined();

    expect(updateMany).toHaveBeenCalledWith({
      data: { rowVersion: { increment: 1 }, validUntil },
      where: { id: 'relation-1', rowVersion: 5 },
    });
    expect(append).toHaveBeenCalledWith(
      transaction,
      expect.objectContaining({
        action: 'HOST_OPERATOR_ENDED',
        afterData: {
          changeReason: '初始分配',
          hostId: 'host-1',
          operatorId: 'operator-1',
          rowVersion: 6,
          validFrom: '2026-07-01',
          validUntil: '2026-07-31',
        },
        beforeData: {
          changeReason: '初始分配',
          hostId: 'host-1',
          operatorId: 'operator-1',
          rowVersion: 5,
          validFrom: '2026-07-01',
          validUntil: null,
        },
        reason: '主播转组',
      }),
    );
  });

  it('allows only administrators to update sites', () => {
    const { database, service } = createService({});

    expect(() =>
      service.updateSite(customerServiceContext, {
        expectedRowVersion: 1,
        id: 'site-songjiang',
        name: '松江',
        reason: '调整状态',
        sortOrder: 10,
        status: 'ACTIVE',
        timezone: 'Asia/Shanghai',
      }),
    ).toThrow(AuthorizationDeniedError);
    expect(database.transaction).not.toHaveBeenCalled();
  });
});
