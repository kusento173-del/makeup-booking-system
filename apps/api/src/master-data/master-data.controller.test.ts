import { describe, expect, it, vi } from 'vitest';

import type { AccessTokenClaims } from '../auth/auth-session.types';
import type { MasterDataCommandContextService } from './master-data-command-context.service';
import type { MasterDataCommandContext } from './master-data-command.types';
import type { MasterDataCreateService } from './master-data-create.service';
import type { MasterDataQueryService } from './master-data-query.service';
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
});
