import { describe, expect, it, vi } from 'vitest';

import type { AccessTokenClaims } from '../auth/auth-session.types';
import type { MasterDataCommandContextService } from '../master-data/master-data-command-context.service';
import type { ArtistShiftService } from './artist-shift.service';
import type { ShiftChangeService } from './shift-change.service';
import { ShiftController } from './shift.controller';
import { ShiftRequestInvalidError } from './shift-request.parser';
import type { ShiftCommandContext } from './shift.types';

const artistId = '019f7a17-6845-7a90-94cb-e5f5caabd5f6';
const authorization: AccessTokenClaims = {
  expiresAt: new Date('2026-07-22T07:00:00.000Z'),
  roleAssignmentId: 'role-1',
  roleCode: 'ARTIST',
  sessionId: 'session-1',
  siteId: null,
  userId: 'user-1',
};
const context: ShiftCommandContext = { actorName: '柔柔', ...authorization };

describe('ShiftController', () => {
  it('derives a trusted actor and passes only parsed initial-shift fields', async () => {
    const resolve = vi.fn().mockResolvedValue(context);
    const setInitialShift = vi.fn().mockResolvedValue({ id: 'shift-1' });
    const controller = new ShiftController(
      { resolve } as unknown as MasterDataCommandContextService,
      {} as ShiftChangeService,
      { setInitialShift } as unknown as ArtistShiftService,
    );

    await expect(
      controller.setInitialShift(
        artistId,
        {
          breakEndMinute: 780,
          breakStartMinute: 720,
          workEndMinute: 1080,
          workStartMinute: 540,
          workdays: [1, 2, 3, 4, 5],
        },
        authorization,
        '127.0.0.1',
        'mobile-web',
        'request-1',
      ),
    ).resolves.toEqual({ id: 'shift-1' });
    expect(resolve).toHaveBeenCalledWith(authorization, {
      clientType: 'MOBILE_WEB',
      ipAddress: '127.0.0.1',
      requestId: 'request-1',
      userAgent: 'mobile-web',
    });
    expect(setInitialShift).toHaveBeenCalledWith(context, {
      artistId,
      breakEndMinute: 780,
      breakStartMinute: 720,
      workEndMinute: 1080,
      workStartMinute: 540,
      workdays: [1, 2, 3, 4, 5],
    });
  });

  it('rejects untrusted query scope before reading the current shift', () => {
    const getCurrentShift = vi.fn();
    const controller = new ShiftController(
      {} as MasterDataCommandContextService,
      {} as ShiftChangeService,
      { getCurrentShift } as unknown as ArtistShiftService,
    );

    expect(() =>
      controller.getCurrentShift(artistId, { siteId: 'untrusted-site' }, authorization),
    ).toThrow(ShiftRequestInvalidError);
    expect(getCurrentShift).not.toHaveBeenCalled();
  });

  it('parses and submits a change through the verified artist context', async () => {
    const resolve = vi.fn().mockResolvedValue(context);
    const submit = vi.fn().mockResolvedValue({ id: 'change-1' });
    const controller = new ShiftController(
      { resolve } as unknown as MasterDataCommandContextService,
      { submit } as unknown as ShiftChangeService,
      {} as ArtistShiftService,
    );

    await expect(
      controller.submitChange(
        artistId,
        {
          effectiveFrom: '2026-07-24',
          reason: '调整班次',
          workEndMinute: 1080,
          workStartMinute: 540,
          workdays: [1, 2, 3],
        },
        authorization,
        '127.0.0.1',
      ),
    ).resolves.toEqual({ id: 'change-1' });
    expect(submit).toHaveBeenCalledWith(
      context,
      expect.objectContaining({
        artistId,
        effectiveFrom: new Date('2026-07-24T00:00:00.000Z'),
        reason: '调整班次',
      }),
    );
  });

  it('passes a strict direct-change command through the verified backoffice context', async () => {
    const backofficeAuthorization = {
      ...authorization,
      roleCode: 'CUSTOMER_SERVICE',
      siteId: 'site-songjiang',
    } as const;
    const backofficeContext = { actorName: '松江客服', ...backofficeAuthorization };
    const resolve = vi.fn().mockResolvedValue(backofficeContext);
    const directChange = vi.fn().mockResolvedValue({ id: 'shift-2' });
    const controller = new ShiftController(
      { resolve } as unknown as MasterDataCommandContextService,
      { directChange } as unknown as ShiftChangeService,
      {} as ArtistShiftService,
    );

    await controller.directChange(
      artistId,
      {
        effectiveFrom: '2026-07-24',
        expectedVersionNo: 1,
        reason: '客服代改',
        workEndMinute: 1080,
        workStartMinute: 540,
        workdays: [1, 2, 3],
      },
      backofficeAuthorization,
      '127.0.0.1',
    );
    expect(directChange).toHaveBeenCalledWith(
      backofficeContext,
      expect.objectContaining({
        artistId,
        expectedVersionNo: 1,
        reason: '客服代改',
      }),
    );
  });
});
