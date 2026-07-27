import { describe, expect, it, vi } from 'vitest';

import type { AccessTokenClaims } from '../auth/auth-session.types';
import type { MasterDataCommandContextService } from '../master-data/master-data-command-context.service';
import { OvertimeController } from './overtime.controller';
import type { OvertimeService } from './overtime.service';
import type { OvertimeCommandContext } from './overtime.types';

const artistId = '019f7a17-6845-7a90-94cb-e5f5caabd5f6';
const overtimeId = '019f7a18-6845-7a90-94cb-e5f5caabd5f6';
const authorization: AccessTokenClaims = {
  expiresAt: new Date('2026-07-22T07:00:00.000Z'),
  roleAssignmentId: 'role-artist',
  roleCode: 'ARTIST',
  sessionId: 'session-1',
  siteId: null,
  userId: 'user-artist',
};
const context: OvertimeCommandContext = { actorName: '柔柔', ...authorization };
const requestBody = {
  breakEndMinute: 780,
  breakStartMinute: 720,
  overtimeDate: '2026-07-25',
  reason: '周六加班',
  workEndMinute: 1080,
  workStartMinute: 540,
};

describe('OvertimeController', () => {
  it('lists using only the verified identity and parsed filters', async () => {
    const list = vi.fn().mockResolvedValue({ items: [], page: 2, pageSize: 50, total: 0 });
    const controller = new OvertimeController(
      {} as MasterDataCommandContextService,
      { list } as unknown as OvertimeService,
    );

    await controller.list({ page: '2', status: 'PENDING' }, authorization);

    expect(list).toHaveBeenCalledWith(authorization, {
      page: 2,
      pageSize: 50,
      status: 'PENDING',
    });
  });

  it('submits parsed fields through a trusted mini-program context', async () => {
    const resolve = vi.fn().mockResolvedValue(context);
    const submit = vi.fn().mockResolvedValue({ id: overtimeId });
    const controller = new OvertimeController(
      { resolve } as unknown as MasterDataCommandContextService,
      { submit } as unknown as OvertimeService,
    );

    await controller.submit(
      artistId,
      requestBody,
      authorization,
      '127.0.0.1',
      'mobile-web',
      'request-1',
    );

    expect(resolve).toHaveBeenCalledWith(authorization, {
      clientType: 'MOBILE_WEB',
      ipAddress: '127.0.0.1',
      requestId: 'request-1',
      userAgent: 'mobile-web',
    });
    expect(submit).toHaveBeenCalledWith(context, {
      artistId,
      breakEndMinute: 780,
      breakStartMinute: 720,
      overtimeDate: new Date('2026-07-25T00:00:00.000Z'),
      reason: '周六加班',
      workEndMinute: 1080,
      workStartMinute: 540,
    });
  });

  it('passes direct approval through a trusted backoffice context', async () => {
    const backofficeAuthorization = {
      ...authorization,
      roleCode: 'CUSTOMER_SERVICE',
      siteId: 'site-songjiang',
    } as const;
    const backofficeContext = { actorName: '松江客服', ...backofficeAuthorization };
    const resolve = vi.fn().mockResolvedValue(backofficeContext);
    const directApprove = vi.fn().mockResolvedValue({ id: overtimeId });
    const controller = new OvertimeController(
      { resolve } as unknown as MasterDataCommandContextService,
      { directApprove } as unknown as OvertimeService,
    );

    await controller.directApprove(artistId, requestBody, backofficeAuthorization, '127.0.0.1');

    expect(resolve).toHaveBeenCalledWith(backofficeAuthorization, {
      clientType: 'ADMIN_WEB',
      ipAddress: '127.0.0.1',
    });
    expect(directApprove).toHaveBeenCalledWith(
      backofficeContext,
      expect.objectContaining({ artistId, overtimeDate: new Date('2026-07-25T00:00:00.000Z') }),
    );
  });

  it('reviews with a strict decision and optimistic row version', async () => {
    const resolve = vi.fn().mockResolvedValue(context);
    const review = vi.fn().mockResolvedValue({ id: overtimeId, status: 'APPROVED' });
    const controller = new OvertimeController(
      { resolve } as unknown as MasterDataCommandContextService,
      { review } as unknown as OvertimeService,
    );

    await controller.review(
      overtimeId,
      { comment: ' 同意 ', decision: 'APPROVE', expectedRowVersion: 1 },
      authorization,
      '127.0.0.1',
    );

    expect(review).toHaveBeenCalledWith(context, {
      comment: '同意',
      decision: 'APPROVE',
      expectedRowVersion: 1,
      overtimeId,
    });
  });
});
