import { describe, expect, it, vi } from 'vitest';

import type { AccessTokenClaims } from '../auth/auth-session.types';
import { FixedAppointmentController } from './fixed-appointment.controller';
import type { FixedAvailabilityService } from './fixed-availability.service';

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
    const controller = new FixedAppointmentController({
      getAvailability,
    } as unknown as FixedAvailabilityService);

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
});
