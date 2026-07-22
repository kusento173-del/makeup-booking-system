import { describe, expect, it, vi } from 'vitest';

import type { AccessTokenClaims } from '../auth/auth-session.types';
import type { MasterDataCommandContextService } from './master-data-command-context.service';
import type { MasterDataCommandContext } from './master-data-command.types';
import type { MasterDataCreateService } from './master-data-create.service';
import type { MasterDataQueryService } from './master-data-query.service';
import type { MasterDataUpdateService } from './master-data-update.service';
import { MasterDataController } from './master-data.controller';

const authorization: AccessTokenClaims = {
  expiresAt: new Date('2026-07-22T07:00:00.000Z'),
  roleAssignmentId: 'role-1',
  roleCode: 'ADMIN',
  sessionId: 'session-1',
  siteId: null,
  userId: 'user-1',
};

const context: MasterDataCommandContext = {
  actorName: '管理员',
  ...authorization,
  clientType: 'ADMIN_WEB',
  ipAddress: '127.0.0.1',
  requestId: 'request-1',
};

describe('MasterDataController', () => {
  it('derives the actor context and passes only parsed host fields to the create service', async () => {
    const resolve = vi.fn().mockResolvedValue(context);
    const createHost = vi.fn().mockResolvedValue('host-1');
    const controller = new MasterDataController(
      { resolve } as unknown as MasterDataCommandContextService,
      { createHost } as unknown as MasterDataCreateService,
      {} as MasterDataQueryService,
      {} as MasterDataUpdateService,
    );

    await expect(
      controller.createHost(
        {
          hostCode: ' ZB0001 ',
          nickname: ' 小雨 ',
          realName: ' 主播一 ',
          siteId: '019f7a17-6845-7a90-94cb-e5f5caabd5f6',
        },
        authorization,
        '127.0.0.1',
        undefined,
        'request-1',
      ),
    ).resolves.toEqual({ id: 'host-1' });
    expect(resolve).toHaveBeenCalledWith(authorization, {
      clientType: 'ADMIN_WEB',
      ipAddress: '127.0.0.1',
      requestId: 'request-1',
    });
    expect(createHost).toHaveBeenCalledWith(context, {
      hostCode: 'ZB0001',
      nickname: '小雨',
      realName: '主播一',
      siteId: '019f7a17-6845-7a90-94cb-e5f5caabd5f6',
    });
  });

  it('derives the actor context and enforces parsed row-version updates', async () => {
    const resolve = vi.fn().mockResolvedValue(context);
    const updateSite = vi.fn().mockResolvedValue(undefined);
    const controller = new MasterDataController(
      { resolve } as unknown as MasterDataCommandContextService,
      {} as MasterDataCreateService,
      {} as MasterDataQueryService,
      { updateSite } as unknown as MasterDataUpdateService,
    );

    await expect(
      controller.updateSite(
        '019f7a17-6845-7a90-94cb-e5f5caabd5f6',
        {
          expectedRowVersion: 2,
          name: ' 松江场地 ',
          reason: ' 调整显示名 ',
          sortOrder: 1,
          status: 'ACTIVE',
          timezone: 'Asia/Shanghai',
        },
        authorization,
        '127.0.0.1',
      ),
    ).resolves.toBeUndefined();
    expect(updateSite).toHaveBeenCalledWith(context, {
      expectedRowVersion: 2,
      id: '019f7a17-6845-7a90-94cb-e5f5caabd5f6',
      name: '松江场地',
      reason: '调整显示名',
      sortOrder: 1,
      status: 'ACTIVE',
      timezone: 'Asia/Shanghai',
    });
  });
});
