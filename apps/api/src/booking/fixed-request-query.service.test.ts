import type { DatabaseClient } from '@makeup/database';
import { describe, expect, it, vi } from 'vitest';

import {
  AuthorizationDeniedError,
  AuthorizationPolicyService,
} from '../auth/authorization-policy.service';
import type { VerifiedAuthorizationContext } from '../auth/authorization.types';
import type { DatabaseService } from '../database/database.service';
import { FixedRequestQueryService } from './fixed-request-query.service';

const now = new Date('2026-07-22T04:00:00.000Z');
const context: VerifiedAuthorizationContext = {
  roleAssignmentId: 'role-1',
  roleCode: 'OPERATOR',
  siteId: 'site-1',
  userId: 'operator-user-1',
};
const record = {
  currentRuleId: null,
  effectiveFrom: new Date('2026-07-27T00:00:00.000Z'),
  host: { hostCode: 'ZB01001', nickname: '小雨', realName: '张三' },
  hostId: 'host-1',
  id: 'request-1',
  reason: '固定直播',
  requestType: 'CREATE',
  reviewComment: null,
  reviewedAt: null,
  rowVersion: 1,
  site: { name: '松江场地' },
  siteId: 'site-1',
  status: 'PENDING',
  submittedAt: new Date('2026-07-22T05:00:00.000Z'),
  submittedByOperator: { realName: '运营甲' },
  submittedByOperatorId: 'operator-1',
  targetArtist: { nickname: '柔柔' },
  targetArtistId: 'artist-1',
  targetDurationMinutes: 30,
  targetStartMinute: 540,
  targetWeekdays: [1, 3],
};
const ruleRecord = {
  artist: { nickname: '柔柔', realName: '王四' },
  artistId: 'artist-1',
  durationMinutes: 30,
  host: { hostCode: 'ZB01001', nickname: '小雨', realName: '张三' },
  hostId: 'host-1',
  id: 'rule-1',
  site: { name: '松江场地' },
  siteId: 'site-1',
  startMinute: 540,
  status: 'ACTIVE',
  validFrom: new Date('2026-07-27T00:00:00.000Z'),
  validUntil: null,
  weekdays: [{ isoWeekday: 1 }, { isoWeekday: 3 }],
};

function createService(records: readonly object[] = [record]) {
  const client = {
    fixedAppointmentRule: {
      count: vi.fn().mockResolvedValue(1),
      findMany: vi.fn().mockResolvedValue([ruleRecord]),
    },
    fixedAppointmentRequest: {
      count: vi.fn().mockResolvedValue(records.length),
      findMany: vi.fn().mockResolvedValue(records),
    },
  };
  const database = {
    read: vi.fn((operation: (value: DatabaseClient) => unknown) =>
      operation(client as unknown as DatabaseClient),
    ),
  };
  return {
    client,
    service: new FixedRequestQueryService(
      new AuthorizationPolicyService(),
      database as unknown as DatabaseService,
    ),
  };
}

describe('FixedRequestQueryService', () => {
  it('maps request snapshots and scopes operators to own or currently managed requests', async () => {
    const { client, service } = createService();

    const result = await service.list(context, { page: 1, pageSize: 50, status: 'PENDING' }, now);

    expect(result.items[0]).toEqual({
      currentRuleId: null,
      effectiveFrom: '2026-07-27',
      hostCode: 'ZB01001',
      hostId: 'host-1',
      hostName: '小雨',
      id: 'request-1',
      reason: '固定直播',
      requestType: 'CREATE',
      reviewComment: null,
      reviewedAt: null,
      rowVersion: 1,
      siteId: 'site-1',
      siteName: '松江场地',
      status: 'PENDING',
      submittedAt: '2026-07-22T05:00:00.000Z',
      submittedByOperatorId: 'operator-1',
      submittedByOperatorName: '运营甲',
      targetArtistId: 'artist-1',
      targetArtistNickname: '柔柔',
      targetDurationMinutes: 30,
      targetStartMinute: 540,
      targetWeekdays: [1, 3],
    });
    expect(client.fixedAppointmentRequest.findMany.mock.calls[0]?.[0]).toMatchObject({
      skip: 0,
      take: 50,
      where: {
        OR: [
          { submittedByUserId: 'operator-user-1' },
          {
            host: {
              operatorRelations: {
                some: {
                  operator: { employmentStatus: 'ACTIVE', userId: 'operator-user-1' },
                  OR: [{ validUntil: null }, { validUntil: { gt: new Date('2026-07-22') } }],
                  validFrom: { lte: new Date('2026-07-22') },
                },
              },
            },
          },
        ],
        status: 'PENDING',
      },
    });
  });

  it('scopes customer service by site while administrators keep only explicit filters', async () => {
    const customer = createService();
    await customer.service.list(
      { ...context, roleCode: 'CUSTOMER_SERVICE' },
      { page: 1, pageSize: 20 },
      now,
    );
    expect(customer.client.fixedAppointmentRequest.findMany.mock.calls[0]?.[0]).toMatchObject({
      where: { siteId: 'site-1' },
    });

    const admin = createService();
    await admin.service.list(
      { ...context, roleCode: 'ADMIN', siteId: null },
      { page: 1, pageSize: 20, requestType: 'CREATE' },
      now,
    );
    expect(admin.client.fixedAppointmentRequest.findMany.mock.calls[0]?.[0]).toMatchObject({
      where: { requestType: 'CREATE' },
    });
  });

  it('rejects host and artist roles', () => {
    const { service } = createService();
    expect(() =>
      service.list({ ...context, roleCode: 'HOST' }, { page: 1, pageSize: 20 }, now),
    ).toThrow(AuthorizationDeniedError);
  });

  it('lists fixed rules with site, search and schedule details', async () => {
    const { client, service } = createService();

    const result = await service.listRules(
      { ...context, roleCode: 'ADMIN', siteId: null },
      {
        page: 1,
        pageSize: 50,
        search: '小雨',
        siteId: 'site-1',
        status: 'ACTIVE',
      },
    );

    expect(result).toEqual({
      items: [
        {
          artistId: 'artist-1',
          artistNickname: '柔柔',
          durationMinutes: 30,
          hostCode: 'ZB01001',
          hostId: 'host-1',
          hostName: '小雨',
          id: 'rule-1',
          siteId: 'site-1',
          siteName: '松江场地',
          startMinute: 540,
          status: 'ACTIVE',
          validFrom: '2026-07-27',
          validUntil: null,
          weekdays: [1, 3],
        },
      ],
      page: 1,
      pageSize: 50,
      total: 1,
    });
    expect(client.fixedAppointmentRule.findMany.mock.calls[0]?.[0]).toMatchObject({
      skip: 0,
      take: 50,
      where: {
        AND: [
          { siteId: 'site-1' },
          { status: 'ACTIVE' },
          {
            OR: [
              { artist: { nickname: { contains: '小雨', mode: 'insensitive' } } },
              { artist: { realName: { contains: '小雨', mode: 'insensitive' } } },
              { host: { hostCode: { contains: '小雨', mode: 'insensitive' } } },
              { host: { nickname: { contains: '小雨', mode: 'insensitive' } } },
              { host: { realName: { contains: '小雨', mode: 'insensitive' } } },
            ],
          },
        ],
      },
    });
  });

  it('scopes customer-service fixed rules to its assigned site', async () => {
    const { client, service } = createService();
    await service.listRules(
      { ...context, roleCode: 'CUSTOMER_SERVICE' },
      { page: 1, pageSize: 20, siteId: 'another-site' },
    );

    expect(client.fixedAppointmentRule.findMany.mock.calls[0]?.[0]).toMatchObject({
      where: { siteId: 'site-1' },
    });
    expect(() =>
      service.listRules({ ...context, roleCode: 'OPERATOR' }, { page: 1, pageSize: 20 }),
    ).toThrow(AuthorizationDeniedError);
  });
});
