import { describe, expect, it, vi } from 'vitest';

import type { AccessTokenClaims } from '../auth/auth-session.types';
import type { MasterDataCommandContextService } from '../master-data/master-data-command-context.service';
import type { LeaveService } from './leave.service';
import { LeaveController } from './leave.controller';
import type { LeaveCommandContext } from './leave.types';

const leaveId = '019f7a17-6845-7a90-94cb-e5f5caabd5f6';
const authorization: AccessTokenClaims = {
  expiresAt: new Date('2026-07-22T07:00:00.000Z'),
  roleAssignmentId: 'role-1',
  roleCode: 'HOST',
  sessionId: 'session-1',
  siteId: null,
  userId: 'user-1',
};
const context: LeaveCommandContext = { actorName: '小雨', ...authorization };

describe('LeaveController', () => {
  it('lists current leave through the signed-in subject scope', async () => {
    const resolve = vi.fn().mockResolvedValue(context);
    const listSelf = vi.fn().mockResolvedValue([{ id: leaveId }]);
    const controller = new LeaveController(
      { resolve } as unknown as MasterDataCommandContextService,
      { listSelf } as unknown as LeaveService,
    );

    await expect(controller.listSelf(authorization, '127.0.0.1')).resolves.toEqual([
      { id: leaveId },
    ]);
    expect(listSelf).toHaveBeenCalledWith(context);
  });

  it('previews strictly parsed dates through a trusted self context', async () => {
    const resolve = vi.fn().mockResolvedValue(context);
    const preview = vi.fn().mockResolvedValue({ affectedAppointmentCount: 0 });
    const controller = new LeaveController(
      { resolve } as unknown as MasterDataCommandContextService,
      { preview } as unknown as LeaveService,
    );

    await expect(
      controller.preview(
        { endDate: '2026-07-24', startDate: '2026-07-23' },
        authorization,
        '127.0.0.1',
      ),
    ).resolves.toEqual({ affectedAppointmentCount: 0 });
    expect(resolve).toHaveBeenCalledWith(authorization, {
      clientType: 'MOBILE_WEB',
      ipAddress: '127.0.0.1',
    });
    expect(preview).toHaveBeenCalledWith(context, {
      endDate: new Date('2026-07-24T00:00:00.000Z'),
      startDate: new Date('2026-07-23T00:00:00.000Z'),
    });
  });

  it('creates leave with only normalized request fields and audit metadata', async () => {
    const resolve = vi.fn().mockResolvedValue(context);
    const create = vi.fn().mockResolvedValue({ id: leaveId });
    const controller = new LeaveController(
      { resolve } as unknown as MasterDataCommandContextService,
      { create } as unknown as LeaveService,
    );

    await controller.create(
      {
        confirmedAffectedAppointmentCount: 0,
        endDate: '2026-07-23',
        reason: '  请假  ',
        startDate: '2026-07-23',
      },
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
    expect(create).toHaveBeenCalledWith(context, {
      confirmedAffectedAppointmentCount: 0,
      endDate: new Date('2026-07-23T00:00:00.000Z'),
      reason: '请假',
      startDate: new Date('2026-07-23T00:00:00.000Z'),
    });
  });

  it('cancels by strict id and expected row version', async () => {
    const resolve = vi.fn().mockResolvedValue(context);
    const cancel = vi.fn().mockResolvedValue(undefined);
    const controller = new LeaveController(
      { resolve } as unknown as MasterDataCommandContextService,
      { cancel } as unknown as LeaveService,
    );

    await controller.cancel(leaveId, { expectedRowVersion: 2 }, authorization, '127.0.0.1');

    expect(cancel).toHaveBeenCalledWith(context, { expectedRowVersion: 2, leaveId });
  });
});
