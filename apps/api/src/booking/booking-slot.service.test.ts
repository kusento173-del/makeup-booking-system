import type { DatabaseClient } from '@makeup/database';
import { describe, expect, it, vi } from 'vitest';

import type { ArtistAvailabilityService } from '../availability/artist-availability.service';
import type { ArtistDayAvailability } from '../availability/artist-availability.types';
import {
  AuthorizationDeniedError,
  AuthorizationPolicyService,
} from '../auth/authorization-policy.service';
import type { VerifiedAuthorizationContext } from '../auth/authorization.types';
import type { DatabaseService } from '../database/database.service';
import { BookingHostNotFoundError, BookingSiteMismatchError } from './booking-slot.errors';
import { BookingSlotService } from './booking-slot.service';

const now = new Date('2026-07-22T04:00:00.000Z');
const date = new Date('2026-07-23T00:00:00.000Z');
const available: ArtistDayAvailability = {
  artistId: 'artist-1',
  artistNickname: '柔柔',
  available: true,
  date: '2026-07-23',
  intervals: [
    { endMinute: 720, startMinute: 540 },
    { endMinute: 1080, startMinute: 780 },
  ],
  overtimeId: null,
  shiftTemplateId: 'shift-1',
  siteId: 'site-songjiang',
  source: 'REGULAR_SHIFT',
};
const host = {
  id: 'host-1',
  leaveRecords: [],
  qualificationStatus: 'ACTIVE',
  operatorRelations: [{ operator: { userId: 'operator-user-1' } }],
  site: { status: 'ACTIVE' },
  siteId: 'site-songjiang',
  userId: 'host-user-1',
};
const context: VerifiedAuthorizationContext = {
  roleAssignmentId: 'role-1',
  roleCode: 'HOST',
  siteId: 'site-songjiang',
  userId: 'host-user-1',
};
const input = {
  artistId: 'artist-1',
  date,
  durationMinutes: 30,
  hostId: 'host-1',
};

function createService(options?: {
  appointments?: readonly object[];
  availability?: ArtistDayAvailability;
  fixed?: readonly object[];
  host?: object | null;
  pending?: readonly object[];
}) {
  const getDay = vi.fn().mockResolvedValue(options?.availability ?? available);
  const client = {
    appointment: {
      findMany: vi.fn().mockResolvedValue(options?.appointments ?? []),
      findUnique: vi.fn(),
    },
    fixedAppointmentRequest: {
      findMany: vi.fn().mockResolvedValue(options?.pending ?? []),
    },
    fixedAppointmentRuleWeekday: {
      findMany: vi.fn().mockResolvedValue(options?.fixed ?? []),
    },
    hostProfile: {
      findUnique: vi.fn().mockResolvedValue(options?.host === undefined ? host : options.host),
    },
  };
  const database = {
    read: vi.fn((operation: (value: DatabaseClient) => unknown) =>
      operation(client as unknown as DatabaseClient),
    ),
  };
  const service = new BookingSlotService(
    { getDay } as unknown as ArtistAvailabilityService,
    new AuthorizationPolicyService(),
    database as unknown as DatabaseService,
  );
  return { client, database, getDay, service };
}

describe('BookingSlotService', () => {
  it('removes both artist and host overlaps while preserving complete adjacent slots', async () => {
    const appointments = [
      {
        artistId: 'artist-1',
        endAt: new Date('2026-07-23T01:30:00.000Z'),
        hostId: 'other-host',
        startAt: new Date('2026-07-23T01:00:00.000Z'),
      },
      {
        artistId: 'other-artist',
        endAt: new Date('2026-07-23T05:30:00.000Z'),
        hostId: 'host-1',
        startAt: new Date('2026-07-23T05:00:00.000Z'),
      },
    ];
    const { service } = createService({ appointments });

    const result = await service.getSlots(context, input, now);

    expect(result).toMatchObject({
      availabilitySource: 'REGULAR_SHIFT',
      existingAppointmentCount: 1,
      requiresSecondConfirmation: true,
      unavailableReason: null,
    });
    expect(result.slots).toHaveLength(26);
    expect(result.slots.map((slot) => slot.startMinute)).not.toEqual(
      expect.arrayContaining([540, 555, 780, 795]),
    );
    expect(result.slots).toEqual(
      expect.arrayContaining([
        {
          endAt: '2026-07-23T02:00:00.000Z',
          startAt: '2026-07-23T01:30:00.000Z',
          startMinute: 570,
        },
      ]),
    );
  });

  it('returns a daily-limit reason after two active host appointments', async () => {
    const appointments = [
      {
        artistId: 'other-1',
        endAt: new Date('2026-07-23T01:30:00.000Z'),
        hostId: 'host-1',
        startAt: new Date('2026-07-23T01:00:00.000Z'),
      },
      {
        artistId: 'other-2',
        endAt: new Date('2026-07-23T05:30:00.000Z'),
        hostId: 'host-1',
        startAt: new Date('2026-07-23T05:00:00.000Z'),
      },
    ];
    const { service } = createService({ appointments });

    await expect(service.getSlots(context, input, now)).resolves.toMatchObject({
      existingAppointmentCount: 2,
      slots: [],
      unavailableReason: 'HOST_DAILY_LIMIT_REACHED',
    });
  });

  it('excludes the original appointment and its fixed rule while listing reschedule slots', async () => {
    const { client, service } = createService({
      appointments: [
        {
          artistId: 'other-artist',
          endAt: new Date('2026-07-23T05:30:00.000Z'),
          hostId: 'host-1',
          startAt: new Date('2026-07-23T05:00:00.000Z'),
        },
      ],
    });
    client.appointment.findUnique.mockResolvedValue({
      fixedRuleId: 'fixed-rule-1',
      hostId: 'host-1',
      status: 'BOOKED',
    });

    const result = await service.getSlots(
      context,
      { ...input, excludeAppointmentId: 'appointment-1' },
      now,
    );

    expect(result.existingAppointmentCount).toBe(1);
    const appointmentQuery = client.appointment.findMany.mock.calls[0]?.[0] as {
      where: { id?: { not: string } };
    };
    const fixedQuery = client.fixedAppointmentRuleWeekday.findMany.mock.calls[0]?.[0] as {
      where: { ruleId?: { not: string } };
    };
    expect(appointmentQuery.where.id).toEqual({ not: 'appointment-1' });
    expect(fixedQuery.where.ruleId).toEqual({ not: 'fixed-rule-1' });
  });

  it('removes approved and pending recurring occupation before it becomes a daily instance', async () => {
    const { service } = createService({
      fixed: [{ endMinute: 570, startMinute: 540 }],
      pending: [{ targetDurationMinutes: 30, targetStartMinute: 780 }],
    });

    const result = await service.getSlots(context, input, now);

    expect(result.slots.map((slot) => slot.startMinute)).not.toEqual(
      expect.arrayContaining([540, 555, 780, 795]),
    );
  });

  it.each([
    [{ ...host, qualificationStatus: 'SUSPENDED' }, 'HOST_INELIGIBLE'],
    [{ ...host, site: { status: 'INACTIVE' } }, 'HOST_SITE_INACTIVE'],
    [{ ...host, leaveRecords: [{ id: 'leave-1' }] }, 'HOST_ON_LEAVE'],
  ] as const)(
    'stops before appointment queries when the host is unavailable',
    async (value, reason) => {
      const { client, service } = createService({ host: value });

      await expect(service.getSlots(context, input, now)).resolves.toMatchObject({
        slots: [],
        unavailableReason: reason,
      });
      expect(client.appointment.findMany).not.toHaveBeenCalled();
    },
  );

  it('propagates an artist non-working reason without reading appointments', async () => {
    const unavailable: ArtistDayAvailability = {
      artistId: 'artist-1',
      artistNickname: '柔柔',
      available: false,
      date: '2026-07-23',
      intervals: [],
      reason: 'NON_WORKING_DAY',
      siteId: 'site-songjiang',
    };
    const { client, service } = createService({ availability: unavailable });

    await expect(service.getSlots(context, input, now)).resolves.toMatchObject({
      availabilitySource: null,
      slots: [],
      unavailableReason: 'NON_WORKING_DAY',
    });
    expect(client.appointment.findMany).not.toHaveBeenCalled();
  });

  it('rejects missing hosts and cross-site combinations', async () => {
    const missing = createService({ host: null });
    await expect(missing.service.getSlots(context, input, now)).rejects.toBeInstanceOf(
      BookingHostNotFoundError,
    );

    const mismatch = createService({ host: { ...host, siteId: 'site-wuxi' } });
    await expect(mismatch.service.getSlots(context, input, now)).rejects.toBeInstanceOf(
      BookingSiteMismatchError,
    );
  });

  it('allows only the host, current operator, site customer service or admin to inspect slots', async () => {
    const { service } = createService();
    await expect(
      service.getSlots({ ...context, userId: 'another-host' }, input, now),
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
    await expect(
      service.getSlots({ ...context, roleCode: 'OPERATOR', userId: 'operator-user-1' }, input, now),
    ).resolves.toMatchObject({ hostId: 'host-1' });
    await expect(
      service.getSlots(
        { ...context, roleCode: 'CUSTOMER_SERVICE', siteId: 'site-wuxi' },
        input,
        now,
      ),
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
  });
});
