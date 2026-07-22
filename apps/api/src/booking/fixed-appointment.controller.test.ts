import { describe, expect, it, vi } from 'vitest';

import type { AccessTokenClaims } from '../auth/auth-session.types';
import type { MasterDataCommandContextService } from '../master-data/master-data-command-context.service';
import { FixedAppointmentController } from './fixed-appointment.controller';
import type { FixedAvailabilityService } from './fixed-availability.service';
import type { FixedRequestQueryService } from './fixed-request-query.service';
import type { FixedRequestService } from './fixed-request.service';

const artistId = '019f7a17-6845-7a90-94cb-e5f5caabd5f6';
const hostId = '019f7a18-6845-7a90-94cb-e5f5caabd5f6';
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
      {} as FixedRequestService,
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
      { create } as unknown as FixedRequestService,
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
      {} as FixedRequestService,
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
});
