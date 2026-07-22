import { describe, expect, it, vi } from 'vitest';

import type { AccessTokenClaims } from '../auth/auth-session.types';
import { ScheduleBoardController } from './schedule-board.controller';
import type { ScheduleBoardService } from './schedule-board.service';

const siteId = '019f7a17-6845-7a90-94cb-e5f5caabd5f6';
const authorization: AccessTokenClaims = {
  expiresAt: new Date('2026-07-22T07:00:00.000Z'),
  roleAssignmentId: 'role-customer',
  roleCode: 'CUSTOMER_SERVICE',
  sessionId: 'session-1',
  siteId,
  userId: 'user-customer',
};

describe('ScheduleBoardController', () => {
  it('passes only strict query values and verified identity to the board service', async () => {
    const get = vi.fn().mockResolvedValue({ artists: [] });
    const controller = new ScheduleBoardController({ get } as unknown as ScheduleBoardService);

    await controller.get({ date: '2026-07-22' }, authorization);

    expect(get).toHaveBeenCalledWith(authorization, {
      date: new Date('2026-07-22T00:00:00.000Z'),
    });
  });
});
