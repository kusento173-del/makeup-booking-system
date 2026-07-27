import { describe, expect, it, vi } from 'vitest';

import type { AccessTokenClaims } from '../auth/auth-session.types';
import type { BackofficeAccountService } from './backoffice-account.service';
import { BackofficeIdentityController } from './backoffice-identity.controller';
import type { MasterDataCommandContextService } from './master-data-command-context.service';
import type { WebAccountService } from './web-account.service';

const authorization: AccessTokenClaims = {
  expiresAt: new Date('2026-07-22T07:00:00.000Z'),
  roleAssignmentId: 'role-1',
  roleCode: 'CUSTOMER_SERVICE',
  sessionId: 'session-1',
  siteId: 'site-1',
  userId: 'user-1',
};

describe('BackofficeIdentityController', () => {
  it('derives the actor and provisions a profile web account', async () => {
    const context = { actorName: '客服', ...authorization };
    const resolve = vi.fn().mockResolvedValue(context);
    const provisionProfile = vi.fn().mockResolvedValue({
      loginName: '000001',
      profileId: '019f7a17-6845-7a90-94cb-e5f5caabd5f6',
      roleCode: 'HOST',
    });
    const controller = new BackofficeIdentityController(
      { resolve } as unknown as MasterDataCommandContextService,
      {} as BackofficeAccountService,
      { provisionProfile } as unknown as WebAccountService,
    );

    await expect(
      controller.provisionProfileAccount(
        {
          profileId: '019F7A17-6845-7A90-94CB-E5F5CAABD5F6',
          roleCode: 'HOST',
          temporaryPassword: 'Temporary!2026',
        },
        authorization,
        '127.0.0.1',
      ),
    ).resolves.toMatchObject({ loginName: '000001', roleCode: 'HOST' });
    expect(provisionProfile).toHaveBeenCalledWith(context, {
      profileId: '019f7a17-6845-7a90-94cb-e5f5caabd5f6',
      roleCode: 'HOST',
      temporaryPassword: 'Temporary!2026',
    });
  });
});
