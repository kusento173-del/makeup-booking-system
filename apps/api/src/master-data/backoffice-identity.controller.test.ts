import { describe, expect, it, vi } from 'vitest';

import type { AccessTokenClaims } from '../auth/auth-session.types';
import type { BindingCodeIssuerService } from '../auth/binding-code-issuer.service';
import type { MasterDataCommandContextService } from './master-data-command-context.service';
import { BackofficeIdentityController } from './backoffice-identity.controller';

const authorization: AccessTokenClaims = {
  expiresAt: new Date('2026-07-22T07:00:00.000Z'),
  roleAssignmentId: 'role-1',
  roleCode: 'CUSTOMER_SERVICE',
  sessionId: 'session-1',
  siteId: 'site-1',
  userId: 'user-1',
};

describe('BackofficeIdentityController', () => {
  it('derives the actor and returns the one-time code with an ISO expiry', async () => {
    const context = { actorName: '客服', ...authorization };
    const resolve = vi.fn().mockResolvedValue(context);
    const issue = vi.fn().mockResolvedValue({
      bindingCodeId: 'code-1',
      code: 'ABCD-EFGH',
      expiresAt: new Date('2026-07-23T08:00:00.000Z'),
      profileId: '019f7a17-6845-7a90-94cb-e5f5caabd5f6',
      roleCode: 'HOST',
      siteId: 'site-1',
    });
    const controller = new BackofficeIdentityController(
      { resolve } as unknown as MasterDataCommandContextService,
      { issue } as unknown as BindingCodeIssuerService,
    );

    await expect(
      controller.issueBindingCode(
        { profileId: '019F7A17-6845-7A90-94CB-E5F5CAABD5F6', roleCode: 'HOST' },
        authorization,
        '127.0.0.1',
      ),
    ).resolves.toEqual({
      bindingCodeId: 'code-1',
      code: 'ABCD-EFGH',
      expiresAt: '2026-07-23T08:00:00.000Z',
      profileId: '019f7a17-6845-7a90-94cb-e5f5caabd5f6',
      roleCode: 'HOST',
      siteId: 'site-1',
    });
    expect(issue).toHaveBeenCalledWith(context, {
      profileId: '019f7a17-6845-7a90-94cb-e5f5caabd5f6',
      roleCode: 'HOST',
    });
  });
});
