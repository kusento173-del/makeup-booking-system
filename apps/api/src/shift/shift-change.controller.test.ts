import { describe, expect, it, vi } from 'vitest';

import type { AccessTokenClaims } from '../auth/auth-session.types';
import type { MasterDataCommandContextService } from '../master-data/master-data-command-context.service';
import { ShiftChangeController } from './shift-change.controller';
import type { ShiftChangeService } from './shift-change.service';
import { ShiftRequestInvalidError } from './shift-request.parser';

const requestId = '019f7a17-6845-7a90-94cb-e5f5caabd5f6';
const authorization: AccessTokenClaims = {
  expiresAt: new Date('2026-07-22T07:00:00.000Z'),
  roleAssignmentId: 'role-1',
  roleCode: 'CUSTOMER_SERVICE',
  sessionId: 'session-1',
  siteId: 'site-songjiang',
  userId: 'user-1',
};
const context = { actorName: '松江客服', ...authorization };

describe('ShiftChangeController', () => {
  it('passes a bounded list request without accepting a client site scope', async () => {
    const list = vi.fn().mockResolvedValue({ items: [], page: 1, pageSize: 50, total: 0 });
    const controller = new ShiftChangeController(
      {} as MasterDataCommandContextService,
      { list } as unknown as ShiftChangeService,
    );

    await controller.list({ page: '1', status: 'PENDING' }, authorization);
    expect(list).toHaveBeenCalledWith(authorization, {
      page: 1,
      pageSize: 50,
      status: 'PENDING',
    });
    expect(() => controller.list({ siteId: 'site-wuxi' }, authorization)).toThrow(
      ShiftRequestInvalidError,
    );
  });

  it('derives the audit actor for withdrawal and review commands', async () => {
    const resolve = vi.fn().mockResolvedValue(context);
    const review = vi.fn().mockResolvedValue(null);
    const withdraw = vi.fn().mockResolvedValue(undefined);
    const controller = new ShiftChangeController(
      { resolve } as unknown as MasterDataCommandContextService,
      { review, withdraw } as unknown as ShiftChangeService,
    );

    await controller.withdraw(
      requestId,
      { expectedRowVersion: 1 },
      authorization,
      '127.0.0.1',
      'admin-web',
      'trace-1',
    );
    await controller.review(
      requestId,
      { decision: 'REJECT', expectedRowVersion: 1 },
      authorization,
      '127.0.0.1',
    );

    expect(withdraw).toHaveBeenCalledWith(context, {
      expectedRowVersion: 1,
      requestId,
    });
    expect(review).toHaveBeenCalledWith(context, {
      decision: 'REJECT',
      expectedRowVersion: 1,
      requestId,
    });
    expect(resolve).toHaveBeenNthCalledWith(1, authorization, {
      clientType: 'ADMIN_WEB',
      ipAddress: '127.0.0.1',
      requestId: 'trace-1',
      userAgent: 'admin-web',
    });
  });
});
