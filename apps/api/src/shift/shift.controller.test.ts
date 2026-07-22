import { describe, expect, it, vi } from 'vitest';

import type { AccessTokenClaims } from '../auth/auth-session.types';
import type { MasterDataCommandContextService } from '../master-data/master-data-command-context.service';
import type { ArtistShiftService } from './artist-shift.service';
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
        'miniapp',
        'request-1',
      ),
    ).resolves.toEqual({ id: 'shift-1' });
    expect(resolve).toHaveBeenCalledWith(authorization, {
      clientType: 'WECHAT_MINI_PROGRAM',
      ipAddress: '127.0.0.1',
      requestId: 'request-1',
      userAgent: 'miniapp',
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
      { getCurrentShift } as unknown as ArtistShiftService,
    );

    expect(() =>
      controller.getCurrentShift(artistId, { siteId: 'untrusted-site' }, authorization),
    ).toThrow(ShiftRequestInvalidError);
    expect(getCurrentShift).not.toHaveBeenCalled();
  });
});
