import type { DatabaseClient } from '@makeup/database';
import { describe, expect, it, vi } from 'vitest';

import {
  AuthorizationDeniedError,
  AuthorizationPolicyService,
} from '../auth/authorization-policy.service';
import type { VerifiedAuthorizationContext } from '../auth/authorization.types';
import type { DatabaseService } from '../database/database.service';
import { FixedAvailabilityDateInvalidError } from './fixed-availability.errors';
import { FixedAvailabilityService } from './fixed-availability.service';

const now = new Date('2026-07-22T04:00:00.000Z');
const requestedStartDate = new Date('2026-07-27T00:00:00.000Z');
const context: VerifiedAuthorizationContext = {
  roleAssignmentId: 'role-1',
  roleCode: 'OPERATOR',
  siteId: 'site-1',
  userId: 'operator-user-1',
};
const input = {
  artistId: 'artist-1',
  durationMinutes: 30,
  hostId: 'host-1',
  requestedStartDate,
  weekdays: [1, 3],
};
const host = {
  fixedRequests: [],
  fixedRules: [],
  id: 'host-1',
  leaveRecords: [
    {
      endDate: new Date('2026-07-29T00:00:00.000Z'),
      startDate: new Date('2026-07-28T00:00:00.000Z'),
    },
  ],
  operatorRelations: [
    {
      operator: {
        employmentStatus: 'ACTIVE',
        siteId: 'site-1',
        userId: 'operator-user-1',
      },
    },
  ],
  qualificationStatus: 'ACTIVE',
  site: { status: 'ACTIVE' },
  siteId: 'site-1',
};
const artist = {
  employmentStatus: 'ACTIVE',
  id: 'artist-1',
  leaveRecords: [
    {
      endDate: new Date('2026-08-03T00:00:00.000Z'),
      startDate: new Date('2026-08-03T00:00:00.000Z'),
    },
  ],
  shiftTemplates: [
    {
      breakEndMinute: 780,
      breakStartMinute: 720,
      validFrom: new Date('2026-01-01T00:00:00.000Z'),
      validUntil: null,
      workEndMinute: 1020,
      workStartMinute: 540,
      workdays: [1, 2, 3, 4, 5],
    },
  ],
  site: { status: 'ACTIVE' },
  siteId: 'site-1',
};

function createService(options?: {
  artist?: object | null;
  artistSingles?: readonly object[];
  fixed?: readonly object[];
  host?: object | null;
  hostSingles?: readonly object[];
  pending?: readonly object[];
}) {
  const client = {
    appointment: {
      findMany: vi
        .fn()
        .mockResolvedValueOnce(options?.artistSingles ?? [])
        .mockResolvedValueOnce(options?.hostSingles ?? []),
    },
    artistProfile: {
      findUnique: vi
        .fn()
        .mockResolvedValue(options?.artist === undefined ? artist : options.artist),
    },
    fixedAppointmentRuleWeekday: {
      findMany: vi.fn().mockResolvedValue(options?.fixed ?? []),
    },
    fixedAppointmentRequest: {
      findMany: vi.fn().mockResolvedValue(options?.pending ?? []),
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
  return {
    client,
    service: new FixedAvailabilityService(
      new AuthorizationPolicyService(),
      database as unknown as DatabaseService,
    ),
  };
}

describe('FixedAvailabilityService', () => {
  it('lists stable shift slots, permanently blocks fixed overlaps and delays single conflicts', async () => {
    const { service } = createService({
      artistSingles: [
        {
          appointmentDate: new Date('2026-08-03T00:00:00.000Z'),
          endAt: new Date('2026-08-03T01:30:00.000Z'),
          startAt: new Date('2026-08-03T01:00:00.000Z'),
        },
      ],
      fixed: [
        {
          artistId: 'artist-1',
          endMinute: 600,
          hostId: 'other-host',
          isoWeekday: 1,
          startMinute: 570,
        },
      ],
      pending: [
        {
          hostId: 'pending-host',
          targetDurationMinutes: 30,
          targetStartMinute: 600,
          targetWeekdays: [3],
        },
      ],
    });

    const result = await service.getAvailability(context, input, now);

    expect(result).toMatchObject({
      artistLeaveDates: ['2026-08-03'],
      hostLeaveDates: ['2026-07-29'],
      unavailableReason: null,
      weekdays: [1, 3],
    });
    expect(result.slots.find((slot) => slot.startMinute === 540)).toEqual({
      available: true,
      earliestStartDate: '2026-08-04',
      endMinute: 570,
      fixedConflictWeekdays: [],
      singleConflictDates: ['2026-08-03'],
      startMinute: 540,
    });
    expect(result.slots.find((slot) => slot.startMinute === 570)).toMatchObject({
      available: false,
      earliestStartDate: null,
      fixedConflictWeekdays: [1],
    });
    expect(result.slots.find((slot) => slot.startMinute === 600)).toMatchObject({
      available: false,
      earliestStartDate: null,
      fixedConflictWeekdays: [3],
    });
    expect(result.slots.some((slot) => slot.startMinute === 705)).toBe(false);
    expect(result.slots.some((slot) => slot.startMinute === 780)).toBe(true);
  });

  it('intersects already-approved future shift versions', async () => {
    const futureArtist = {
      ...artist,
      shiftTemplates: [
        { ...artist.shiftTemplates[0], validUntil: new Date('2026-08-01T00:00:00.000Z') },
        {
          ...artist.shiftTemplates[0],
          validFrom: new Date('2026-08-01T00:00:00.000Z'),
          workEndMinute: 960,
        },
      ],
    };
    const { service } = createService({ artist: futureArtist });

    const result = await service.getAvailability(context, input, now);

    expect(result.slots.some((slot) => slot.startMinute === 930)).toBe(true);
    expect(result.slots.some((slot) => slot.startMinute === 945)).toBe(false);
  });

  it('can exclude the rule being changed from host and slot conflicts', async () => {
    const { client, service } = createService();

    await service.getAvailabilityWithClient(
      client as unknown as DatabaseClient,
      context,
      input,
      now,
      { excludeRuleId: 'rule-1' },
    );

    expect(client.hostProfile.findUnique.mock.calls[0]?.[0]).toMatchObject({
      select: { fixedRules: { where: { id: { not: 'rule-1' }, status: 'ACTIVE' } } },
    });
    expect(client.fixedAppointmentRuleWeekday.findMany.mock.calls[0]?.[0]).toMatchObject({
      where: { ruleId: { not: 'rule-1' } },
    });
  });

  it.each([
    [{ ...host, qualificationStatus: 'SUSPENDED' }, artist, 'HOST_INELIGIBLE'],
    [{ ...host, fixedRules: [{ id: 'rule-1' }] }, artist, 'HOST_HAS_ACTIVE_FIXED_RULE'],
    [{ ...host, fixedRequests: [{ id: 'request-1' }] }, artist, 'HOST_HAS_PENDING_FIXED_REQUEST'],
    [host, { ...artist, employmentStatus: 'INACTIVE' }, 'ARTIST_INACTIVE'],
    [host, { ...artist, shiftTemplates: [] }, 'SHIFT_NOT_CONFIGURED'],
    [
      host,
      { ...artist, shiftTemplates: [{ ...artist.shiftTemplates[0], workdays: [1] }] },
      'NON_WORKING_WEEKDAY',
    ],
  ] as const)(
    'returns a global reason without querying occupations',
    async (hostValue, artistValue, reason) => {
      const { client, service } = createService({ artist: artistValue, host: hostValue });

      await expect(service.getAvailability(context, input, now)).resolves.toMatchObject({
        slots: [],
        unavailableReason: reason,
      });
      expect(client.fixedAppointmentRuleWeekday.findMany).not.toHaveBeenCalled();
    },
  );

  it('enforces actor scope and a future business date', async () => {
    const { service } = createService();
    await expect(
      service.getAvailability({ ...context, userId: 'other-operator' }, input, now),
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
    expect(() =>
      service.getAvailability(
        context,
        { ...input, requestedStartDate: new Date('2026-07-22') },
        now,
      ),
    ).toThrow(FixedAvailabilityDateInvalidError);
  });
});
