import type { DatabaseClient } from '@makeup/database';
import { describe, expect, it, vi } from 'vitest';

import {
  AuthorizationDeniedError,
  AuthorizationPolicyService,
} from '../auth/authorization-policy.service';
import type { DatabaseService } from '../database/database.service';
import { FixedStateService } from './fixed-state.service';

const now = new Date('2026-07-22T04:00:00.000Z');
const context = {
  roleAssignmentId: 'role-1',
  roleCode: 'OPERATOR' as const,
  siteId: 'site-1',
  userId: 'operator-user-1',
};
const host = {
  fixedRequests: [
    {
      effectiveFrom: new Date('2026-07-29T00:00:00.000Z'),
      id: 'request-1',
      requestType: 'CHANGE',
      rowVersion: 1,
      targetArtistId: 'artist-1',
      targetDurationMinutes: 45,
      targetStartMinute: 600,
      targetWeekdays: [2, 4],
    },
  ],
  fixedRules: [
    {
      artist: { nickname: '柔柔' },
      artistId: 'artist-1',
      durationMinutes: 30,
      id: 'rule-1',
      rowVersion: 1,
      startMinute: 540,
      validFrom: new Date('2026-07-23T00:00:00.000Z'),
      weekdays: [{ isoWeekday: 1 }, { isoWeekday: 3 }],
    },
  ],
  id: 'host-1',
  operatorRelations: [
    {
      operator: {
        employmentStatus: 'ACTIVE',
        siteId: 'site-1',
        userId: 'operator-user-1',
      },
    },
  ],
  siteId: 'site-1',
};
const managedHost = {
  ...host,
  hostCode: 'ZB01001',
  leaveRecords: [],
  nickname: '小雨',
  qualificationStatus: 'ACTIVE',
  realName: '张三',
  site: { name: '松江', status: 'ACTIVE' },
};
const fixedRelation = {
  artist: { nickname: '柔柔', realName: '王柔' },
  artistId: 'artist-1',
  durationMinutes: 30,
  host: { hostCode: 'ZB01001', nickname: '小雨', realName: '张三' },
  hostId: 'host-1',
  id: 'rule-1',
  site: { name: '松江' },
  siteId: 'site-1',
  startMinute: 540,
  validFrom: new Date('2026-07-26T00:00:00.000Z'),
  validUntil: null,
  weekdays: [{ isoWeekday: 1 }, { isoWeekday: 3 }],
};

function createService(hostValue: object | null = host) {
  const client = {
    fixedAppointmentRule: {
      findMany: vi.fn().mockResolvedValue([fixedRelation]),
    },
    hostProfile: {
      count: vi.fn().mockResolvedValue(1),
      findMany: vi.fn().mockResolvedValue([managedHost]),
      findUnique: vi.fn().mockResolvedValue(hostValue),
    },
  };
  const database = {
    read: vi.fn((operation: (value: DatabaseClient) => unknown) =>
      operation(client as unknown as DatabaseClient),
    ),
  };
  return {
    client,
    service: new FixedStateService(
      new AuthorizationPolicyService(),
      database as unknown as DatabaseService,
    ),
  };
}

describe('FixedStateService', () => {
  it('returns the active immutable rule and pending request to the current operator', async () => {
    const { client, service } = createService();

    await expect(service.get(context, 'host-1', now)).resolves.toEqual({
      activeRule: {
        artistId: 'artist-1',
        artistNickname: '柔柔',
        durationMinutes: 30,
        id: 'rule-1',
        rowVersion: 1,
        startMinute: 540,
        validFrom: '2026-07-23',
        weekdays: [1, 3],
      },
      hostId: 'host-1',
      pendingRequest: {
        effectiveFrom: '2026-07-29',
        id: 'request-1',
        requestType: 'CHANGE',
        rowVersion: 1,
        targetArtistId: 'artist-1',
        targetDurationMinutes: 45,
        targetStartMinute: 600,
        targetWeekdays: [2, 4],
      },
      siteId: 'site-1',
    });
    expect(client.hostProfile.findUnique.mock.calls[0]?.[0]).toMatchObject({
      select: {
        operatorRelations: {
          where: {
            OR: [{ validUntil: null }, { validUntil: { gt: new Date('2026-07-22') } }],
            validFrom: { lte: new Date('2026-07-22') },
          },
        },
      },
    });
  });

  it('enforces current operator and customer-service site scope', async () => {
    const otherOperator = createService();
    await expect(
      otherOperator.service.get({ ...context, userId: 'other-user' }, 'host-1', now),
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);

    const crossSite = createService();
    await expect(
      crossSite.service.get(
        { ...context, roleCode: 'CUSTOMER_SERVICE', siteId: 'site-2' },
        'host-1',
        now,
      ),
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
  });

  it('lists only current operator hosts with fixed and booking availability state', async () => {
    const { client, service } = createService();
    const asOf = new Date('2026-07-27T00:00:00.000Z');

    await expect(
      service.listManagedHosts(context, {
        asOf,
        hostId: 'host-1',
        page: 1,
        pageSize: 50,
        search: '小雨',
      }),
    ).resolves.toEqual({
      items: [
        {
          activeRule: {
            artistId: 'artist-1',
            artistNickname: '柔柔',
            durationMinutes: 30,
            id: 'rule-1',
            rowVersion: 1,
            startMinute: 540,
            validFrom: '2026-07-23',
            weekdays: [1, 3],
          },
          bookingAvailability: 'AVAILABLE',
          hostCode: 'ZB01001',
          hostId: 'host-1',
          hostName: '小雨',
          pendingRequest: {
            effectiveFrom: '2026-07-29',
            id: 'request-1',
            requestType: 'CHANGE',
            rowVersion: 1,
            targetArtistId: 'artist-1',
            targetDurationMinutes: 45,
            targetStartMinute: 600,
            targetWeekdays: [2, 4],
          },
          qualificationStatus: 'ACTIVE',
          siteId: 'site-1',
          siteName: '松江',
        },
      ],
      page: 1,
      pageSize: 50,
      total: 1,
    });
    expect(client.hostProfile.findMany.mock.calls[0]?.[0]).toMatchObject({
      select: {
        fixedRules: {
          orderBy: { validFrom: 'desc' },
          where: {
            OR: [
              { status: 'ACTIVE' },
              {
                OR: [{ validUntil: null }, { validUntil: { gt: asOf } }],
                validFrom: { lte: asOf },
              },
            ],
          },
        },
        leaveRecords: {
          where: {
            endDate: { gte: asOf },
            startDate: { lte: asOf },
            status: 'ACTIVE',
          },
        },
      },
      where: {
        AND: [
          { siteId: 'site-1' },
          {
            operatorRelations: {
              some: {
                operator: {
                  employmentStatus: 'ACTIVE',
                  siteId: 'site-1',
                  userId: 'operator-user-1',
                },
                OR: [{ validUntil: null }, { validUntil: { gt: asOf } }],
                validFrom: { lte: asOf },
              },
            },
          },
          { id: 'host-1' },
          {
            OR: [
              { hostCode: { contains: '小雨', mode: 'insensitive' } },
              { nickname: { contains: '小雨', mode: 'insensitive' } },
              { realName: { contains: '小雨', mode: 'insensitive' } },
            ],
          },
        ],
      },
    });
  });

  it('marks leave and qualification restrictions and rejects non-operators', async () => {
    const leave = createService();
    leave.client.hostProfile.findMany.mockResolvedValue([
      { ...managedHost, leaveRecords: [{ id: 'leave-1' }] },
    ]);
    await expect(
      leave.service.listManagedHosts(context, {
        asOf: new Date('2026-07-27T00:00:00.000Z'),
        page: 1,
        pageSize: 20,
      }),
    ).resolves.toMatchObject({
      items: [{ bookingAvailability: 'ON_LEAVE' }],
    });

    expect(() =>
      leave.service.listManagedHosts(
        { ...context, roleCode: 'CUSTOMER_SERVICE' },
        {
          asOf: new Date('2026-07-27T00:00:00.000Z'),
          page: 1,
          pageSize: 20,
        },
      ),
    ).toThrow(AuthorizationDeniedError);
  });

  it('lists current and approved upcoming fixed relations for the signed-in host or artist', async () => {
    const { client, service } = createService();

    await expect(
      service.listMyFixedRelations(
        { ...context, roleCode: 'HOST', siteId: 'site-1', userId: 'host-user-1' },
        now,
      ),
    ).resolves.toEqual([
      {
        artistId: 'artist-1',
        artistNickname: '柔柔',
        durationMinutes: 30,
        hostCode: 'ZB01001',
        hostId: 'host-1',
        hostName: '小雨',
        id: 'rule-1',
        siteId: 'site-1',
        siteName: '松江',
        startMinute: 540,
        validFrom: '2026-07-26',
        validUntil: null,
        weekdays: [1, 3],
      },
    ]);
    expect(client.fixedAppointmentRule.findMany.mock.calls[0]?.[0]).toMatchObject({
      where: {
        host: { userId: 'host-user-1' },
        OR: [
          { status: 'ACTIVE' },
          {
            OR: [{ validUntil: null }, { validUntil: { gt: new Date('2026-07-22') } }],
            validFrom: { lte: new Date('2026-07-22') },
          },
        ],
      },
    });

    await service.listMyFixedRelations(
      { ...context, roleCode: 'ARTIST', userId: 'artist-user-1' },
      now,
    );
    expect(client.fixedAppointmentRule.findMany.mock.calls[1]?.[0]).toMatchObject({
      where: { artist: { userId: 'artist-user-1' } },
    });
    expect(() => service.listMyFixedRelations({ ...context, roleCode: 'OPERATOR' }, now)).toThrow(
      AuthorizationDeniedError,
    );
  });
});
