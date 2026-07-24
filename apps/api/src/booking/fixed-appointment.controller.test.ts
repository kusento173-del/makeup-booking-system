import { describe, expect, it, vi } from 'vitest';

import type { AccessTokenClaims } from '../auth/auth-session.types';
import type { MasterDataCommandContextService } from '../master-data/master-data-command-context.service';
import { FixedAppointmentController } from './fixed-appointment.controller';
import type { FixedAvailabilityService } from './fixed-availability.service';
import type { FixedRequestQueryService } from './fixed-request-query.service';
import type { FixedRequestReviewService } from './fixed-request-review.service';
import type { FixedRequestWithdrawService } from './fixed-request-withdraw.service';
import type { FixedRequestService } from './fixed-request.service';
import type { FixedStateService } from './fixed-state.service';

const artistId = '019f7a17-6845-7a90-94cb-e5f5caabd5f6';
const hostId = '019f7a18-6845-7a90-94cb-e5f5caabd5f6';
const ruleId = '019f7a19-6845-7a90-94cb-e5f5caabd5f6';
const authorization: AccessTokenClaims = {
  expiresAt: new Date('2026-07-22T07:00:00.000Z'),
  roleAssignmentId: 'role-operator',
  roleCode: 'OPERATOR',
  sessionId: 'session-1',
  siteId: 'site-1',
  userId: 'user-operator',
};

describe('FixedAppointmentController', () => {
  it('uses the verified identity and strict fixed-availability filters', async () => {
    const getAvailability = vi.fn().mockResolvedValue({ slots: [] });
    const controller = new FixedAppointmentController(
      {
        getAvailability,
      } as unknown as FixedAvailabilityService,
      {} as MasterDataCommandContextService,
      {} as FixedRequestQueryService,
      {} as FixedRequestReviewService,
      {} as FixedRequestService,
      {} as FixedStateService,
      {} as FixedRequestWithdrawService,
    );

    await controller.getAvailability(
      {
        artistId,
        durationMinutes: '45',
        hostId,
        requestedStartDate: '2026-07-27',
        weekdays: '1,3',
      },
      authorization,
    );

    expect(getAvailability).toHaveBeenCalledWith(authorization, {
      artistId,
      durationMinutes: 45,
      hostId,
      requestedStartDate: new Date('2026-07-27T00:00:00.000Z'),
      weekdays: [1, 3],
    });
  });

  it('submits through a trusted mini-program command context', async () => {
    const commandContext = { actorName: '运营小周', ...authorization };
    const resolve = vi.fn().mockResolvedValue(commandContext);
    const create = vi.fn().mockResolvedValue({ request: { id: 'request-1' } });
    const controller = new FixedAppointmentController(
      {} as FixedAvailabilityService,
      { resolve } as unknown as MasterDataCommandContextService,
      {} as FixedRequestQueryService,
      {} as FixedRequestReviewService,
      { create } as unknown as FixedRequestService,
      {} as FixedStateService,
      {} as FixedRequestWithdrawService,
    );

    await controller.createRequest(
      {
        artistId,
        durationMinutes: 30,
        effectiveFrom: '2026-07-27',
        hostId,
        reason: '申请固定',
        startMinute: 540,
        weekdays: [1, 3],
      },
      'fixed-key-0001',
      authorization,
      '127.0.0.1',
      'miniapp',
      'request-trace-1',
    );

    expect(resolve).toHaveBeenCalledWith(authorization, {
      clientType: 'WECHAT_MINI_PROGRAM',
      ipAddress: '127.0.0.1',
      requestId: 'request-trace-1',
      userAgent: 'miniapp',
    });
    expect(create).toHaveBeenCalledWith(commandContext, {
      artistId,
      durationMinutes: 30,
      effectiveFrom: new Date('2026-07-27T00:00:00.000Z'),
      hostId,
      idempotencyKey: 'fixed-key-0001',
      reason: '申请固定',
      startMinute: 540,
      weekdays: [1, 3],
    });
  });

  it('lists requests with strict filters and verified identity', async () => {
    const list = vi.fn().mockResolvedValue({ items: [], page: 2, pageSize: 20, total: 0 });
    const controller = new FixedAppointmentController(
      {} as FixedAvailabilityService,
      {} as MasterDataCommandContextService,
      { list } as unknown as FixedRequestQueryService,
      {} as FixedRequestReviewService,
      {} as FixedRequestService,
      {} as FixedStateService,
      {} as FixedRequestWithdrawService,
    );

    await controller.listRequests(
      { page: '2', pageSize: '20', requestType: 'CREATE', status: 'PENDING' },
      authorization,
    );

    expect(list).toHaveBeenCalledWith(authorization, {
      page: 2,
      pageSize: 20,
      requestType: 'CREATE',
      status: 'PENDING',
    });
  });

  it('lists fixed rules with strict filters and verified identity', async () => {
    const listRules = vi.fn().mockResolvedValue({ items: [], page: 1, pageSize: 50, total: 0 });
    const controller = new FixedAppointmentController(
      {} as FixedAvailabilityService,
      {} as MasterDataCommandContextService,
      { listRules } as unknown as FixedRequestQueryService,
      {} as FixedRequestReviewService,
      {} as FixedRequestService,
      {} as FixedStateService,
      {} as FixedRequestWithdrawService,
    );

    await controller.listRules(
      {
        page: '1',
        pageSize: '50',
        search: '阿伟',
        siteId: artistId,
        status: 'ACTIVE',
      },
      authorization,
    );

    expect(listRules).toHaveBeenCalledWith(authorization, {
      page: 1,
      pageSize: 50,
      search: '阿伟',
      siteId: artistId,
      status: 'ACTIVE',
    });
  });

  it('lists managed hosts using verified operator identity and target date', async () => {
    const listManagedHosts = vi
      .fn()
      .mockResolvedValue({ items: [], page: 1, pageSize: 50, total: 0 });
    const controller = new FixedAppointmentController(
      {} as FixedAvailabilityService,
      {} as MasterDataCommandContextService,
      {} as FixedRequestQueryService,
      {} as FixedRequestReviewService,
      {} as FixedRequestService,
      { listManagedHosts } as unknown as FixedStateService,
      {} as FixedRequestWithdrawService,
    );

    await controller.listManagedHosts(
      {
        asOf: '2026-07-27',
        hostId,
        page: '1',
        pageSize: '50',
        search: '阿伟',
      },
      authorization,
    );

    expect(listManagedHosts).toHaveBeenCalledWith(authorization, {
      asOf: new Date('2026-07-27T00:00:00.000Z'),
      hostId,
      page: 1,
      pageSize: 50,
      search: '阿伟',
    });
  });

  it('submits fixed changes and cancellations through the operator context', async () => {
    const commandContext = { actorName: '运营小周', ...authorization };
    const resolve = vi.fn().mockResolvedValue(commandContext);
    const change = vi.fn().mockResolvedValue({ request: { id: 'change-1' } });
    const cancel = vi.fn().mockResolvedValue({ request: { id: 'cancel-1' } });
    const controller = new FixedAppointmentController(
      {} as FixedAvailabilityService,
      { resolve } as unknown as MasterDataCommandContextService,
      {} as FixedRequestQueryService,
      {} as FixedRequestReviewService,
      { cancel, change } as unknown as FixedRequestService,
      {} as FixedStateService,
      {} as FixedRequestWithdrawService,
    );

    await controller.changeRequest(
      {
        artistId,
        currentRuleId: ruleId,
        durationMinutes: 45,
        effectiveFrom: '2026-07-28',
        hostId,
        reason: '调整固定时间',
        startMinute: 600,
        weekdays: [2, 4],
      },
      'fixed-change-0001',
      authorization,
      '127.0.0.1',
    );
    await controller.cancelRequest(
      {
        currentRuleId: ruleId,
        effectiveFrom: '2026-07-29',
        hostId,
        reason: '取消固定',
      },
      'fixed-cancel-0001',
      authorization,
      '127.0.0.1',
    );

    expect(change).toHaveBeenCalledWith(
      commandContext,
      expect.objectContaining({ currentRuleId: ruleId, idempotencyKey: 'fixed-change-0001' }),
    );
    expect(cancel).toHaveBeenCalledWith(commandContext, {
      currentRuleId: ruleId,
      effectiveFrom: new Date('2026-07-29T00:00:00.000Z'),
      hostId,
      idempotencyKey: 'fixed-cancel-0001',
      reason: '取消固定',
    });
  });

  it('reviews through a trusted backoffice context and path identity', async () => {
    const customerService = { ...authorization, roleCode: 'CUSTOMER_SERVICE' as const };
    const commandContext = { actorName: '松江客服', ...customerService };
    const resolve = vi.fn().mockResolvedValue(commandContext);
    const review = vi.fn().mockResolvedValue({ id: artistId, status: 'APPROVED' });
    const controller = new FixedAppointmentController(
      {} as FixedAvailabilityService,
      { resolve } as unknown as MasterDataCommandContextService,
      {} as FixedRequestQueryService,
      { review } as unknown as FixedRequestReviewService,
      {} as FixedRequestService,
      {} as FixedStateService,
      {} as FixedRequestWithdrawService,
    );

    await controller.reviewRequest(
      artistId,
      { comment: '同意固定', decision: 'APPROVE', expectedRowVersion: 1 },
      customerService,
      '127.0.0.1',
      'admin-web',
      'trace-1',
    );

    expect(resolve).toHaveBeenCalledWith(customerService, {
      clientType: 'ADMIN_WEB',
      ipAddress: '127.0.0.1',
      requestId: 'trace-1',
      userAgent: 'admin-web',
    });
    expect(review).toHaveBeenCalledWith(commandContext, {
      comment: '同意固定',
      decision: 'APPROVE',
      expectedRowVersion: 1,
      requestId: artistId,
    });
  });

  it('reads fixed host state and withdraws through trusted operator identity', async () => {
    const commandContext = { actorName: '运营小周', ...authorization };
    const resolve = vi.fn().mockResolvedValue(commandContext);
    const get = vi.fn().mockResolvedValue({ hostId, siteId: 'site-1' });
    const withdraw = vi.fn().mockResolvedValue({ id: ruleId, status: 'WITHDRAWN' });
    const controller = new FixedAppointmentController(
      {} as FixedAvailabilityService,
      { resolve } as unknown as MasterDataCommandContextService,
      {} as FixedRequestQueryService,
      {} as FixedRequestReviewService,
      {} as FixedRequestService,
      { get } as unknown as FixedStateService,
      { withdraw } as unknown as FixedRequestWithdrawService,
    );

    await controller.getHostState(hostId, authorization);
    await controller.withdrawRequest(
      ruleId,
      { expectedRowVersion: 1 },
      authorization,
      '127.0.0.1',
      'miniapp',
      'trace-2',
    );

    expect(get).toHaveBeenCalledWith(authorization, hostId);
    expect(resolve).toHaveBeenCalledWith(authorization, {
      clientType: 'WECHAT_MINI_PROGRAM',
      ipAddress: '127.0.0.1',
      requestId: 'trace-2',
      userAgent: 'miniapp',
    });
    expect(withdraw).toHaveBeenCalledWith(commandContext, {
      expectedRowVersion: 1,
      requestId: ruleId,
    });
  });
});
