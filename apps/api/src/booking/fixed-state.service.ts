import { Prisma } from '@makeup/database';
import { Injectable } from '@nestjs/common';

import {
  AuthorizationDeniedError,
  AuthorizationPolicyService,
} from '../auth/authorization-policy.service';
import type { VerifiedAuthorizationContext } from '../auth/authorization.types';
import { DatabaseService } from '../database/database.service';
import { formatDateOnly, toBusinessDate } from '../shift/business-date';
import { BookingHostNotFoundError } from './booking-slot.errors';
import { FixedRequestStateConflictError } from './fixed-request.errors';
import type {
  ActiveFixedRuleSummary,
  FixedHostState,
  ManagedHostBookingAvailability,
  ManagedHostListInput,
  ManagedHostPage,
  ManagedHostSummary,
  MyFixedRelationSummary,
  PendingFixedRequestSummary,
} from './fixed-state.types';

const HOST_STATE_SELECT = {
  fixedRequests: {
    orderBy: { submittedAt: 'desc' as const },
    select: {
      effectiveFrom: true,
      id: true,
      requestType: true,
      rowVersion: true,
      targetArtistId: true,
      targetDurationMinutes: true,
      targetStartMinute: true,
      targetWeekdays: true,
    },
    take: 1,
    where: { status: 'PENDING' },
  },
  fixedRules: {
    select: {
      artist: { select: { nickname: true } },
      artistId: true,
      durationMinutes: true,
      id: true,
      rowVersion: true,
      startMinute: true,
      validFrom: true,
      weekdays: { orderBy: { isoWeekday: 'asc' as const }, select: { isoWeekday: true } },
    },
    take: 1,
    where: { status: 'ACTIVE' },
  },
  id: true,
  operatorRelations: {
    orderBy: { validFrom: 'desc' as const },
    select: { operator: { select: { employmentStatus: true, siteId: true, userId: true } } },
    take: 1,
  },
  siteId: true,
} satisfies Prisma.HostProfileSelect;

type HostStateRecord = Prisma.HostProfileGetPayload<{ select: typeof HOST_STATE_SELECT }>;

const MANAGED_HOST_SELECT = {
  fixedRequests: HOST_STATE_SELECT.fixedRequests,
  fixedRules: HOST_STATE_SELECT.fixedRules,
  hostCode: true,
  id: true,
  leaveRecords: { select: { id: true }, take: 1 },
  nickname: true,
  qualificationStatus: true,
  realName: true,
  site: { select: { name: true, status: true } },
  siteId: true,
} satisfies Prisma.HostProfileSelect;

type ManagedHostRecord = Prisma.HostProfileGetPayload<{ select: typeof MANAGED_HOST_SELECT }>;

const MY_FIXED_RELATION_SELECT = {
  artist: { select: { nickname: true, realName: true } },
  artistId: true,
  durationMinutes: true,
  host: { select: { hostCode: true, nickname: true, realName: true } },
  hostId: true,
  id: true,
  site: { select: { name: true } },
  siteId: true,
  startMinute: true,
  validFrom: true,
  validUntil: true,
  weekdays: { orderBy: { isoWeekday: 'asc' as const }, select: { isoWeekday: true } },
} satisfies Prisma.FixedAppointmentRuleSelect;

type MyFixedRelationRecord = Prisma.FixedAppointmentRuleGetPayload<{
  select: typeof MY_FIXED_RELATION_SELECT;
}>;

@Injectable()
export class FixedStateService {
  constructor(
    private readonly authorization: AuthorizationPolicyService,
    private readonly database: DatabaseService,
  ) {}

  get(
    context: VerifiedAuthorizationContext,
    hostId: string,
    now = new Date(),
  ): Promise<FixedHostState> {
    this.authorization.assertRole(context, ['OPERATOR', 'CUSTOMER_SERVICE', 'ADMIN']);
    const today = toBusinessDate(now);
    return this.database.read(async (client) => {
      const host = await client.hostProfile.findUnique({
        select: {
          ...HOST_STATE_SELECT,
          operatorRelations: {
            ...HOST_STATE_SELECT.operatorRelations,
            where: {
              validFrom: { lte: today },
              OR: [{ validUntil: null }, { validUntil: { gt: today } }],
            },
          },
        },
        where: { id: hostId },
      });
      if (!host) throw new BookingHostNotFoundError();
      this.assertScope(context, host);
      return {
        activeRule: host.fixedRules[0] ? this.rule(host.fixedRules[0]) : null,
        hostId: host.id,
        pendingRequest: host.fixedRequests[0] ? this.request(host.fixedRequests[0]) : null,
        siteId: host.siteId,
      };
    });
  }

  listManagedHosts(
    context: VerifiedAuthorizationContext,
    input: ManagedHostListInput,
  ): Promise<ManagedHostPage> {
    this.authorization.assertRole(context, ['OPERATOR']);
    if (!context.siteId) throw new AuthorizationDeniedError();
    const filters: Prisma.HostProfileWhereInput[] = [
      { siteId: context.siteId },
      {
        operatorRelations: {
          some: {
            operator: {
              employmentStatus: 'ACTIVE',
              siteId: context.siteId,
              userId: context.userId,
            },
            validFrom: { lte: input.asOf },
            OR: [{ validUntil: null }, { validUntil: { gt: input.asOf } }],
          },
        },
      },
    ];
    if (input.hostId) filters.push({ id: input.hostId });
    if (input.search) {
      filters.push({
        OR: [
          { hostCode: { contains: input.search, mode: 'insensitive' } },
          { nickname: { contains: input.search, mode: 'insensitive' } },
          { realName: { contains: input.search, mode: 'insensitive' } },
        ],
      });
    }
    const where: Prisma.HostProfileWhereInput = { AND: filters };
    return this.database.read(async (client) => {
      const [records, total] = await Promise.all([
        client.hostProfile.findMany({
          orderBy: [{ siteId: 'asc' }, { hostCode: 'asc' }],
          select: {
            ...MANAGED_HOST_SELECT,
            fixedRules: this.displayFixedRules(input.asOf),
            leaveRecords: {
              ...MANAGED_HOST_SELECT.leaveRecords,
              where: {
                endDate: { gte: input.asOf },
                startDate: { lte: input.asOf },
                status: 'ACTIVE',
              },
            },
          },
          skip: (input.page - 1) * input.pageSize,
          take: input.pageSize,
          where,
        }),
        client.hostProfile.count({ where }),
      ]);
      return {
        items: records.map((record) => this.managedHost(record)),
        page: input.page,
        pageSize: input.pageSize,
        total,
      };
    });
  }

  listMyFixedRelations(
    context: VerifiedAuthorizationContext,
    now = new Date(),
  ): Promise<readonly MyFixedRelationSummary[]> {
    this.authorization.assertRole(context, ['HOST', 'ARTIST']);
    const today = toBusinessDate(now);
    const profileScope =
      context.roleCode === 'HOST'
        ? { host: { userId: context.userId } }
        : { artist: { userId: context.userId } };

    return this.database.read(async (client) => {
      const records = await client.fixedAppointmentRule.findMany({
        orderBy:
          context.roleCode === 'HOST'
            ? [{ validFrom: 'asc' }, { startMinute: 'asc' }]
            : [{ host: { hostCode: 'asc' } }, { validFrom: 'asc' }, { startMinute: 'asc' }],
        select: MY_FIXED_RELATION_SELECT,
        where: {
          ...profileScope,
          OR: [{ status: 'ACTIVE' }, this.currentRuleScope(today)],
        },
      });
      return records.map((record) => this.myFixedRelation(record));
    });
  }

  private assertScope(context: VerifiedAuthorizationContext, host: HostStateRecord): void {
    if (context.roleCode === 'OPERATOR') {
      const operator = host.operatorRelations[0]?.operator;
      if (
        operator?.userId !== context.userId ||
        operator.employmentStatus !== 'ACTIVE' ||
        operator.siteId !== host.siteId
      ) {
        throw new AuthorizationDeniedError();
      }
    } else if (context.roleCode === 'CUSTOMER_SERVICE') {
      this.authorization.assertSiteScope(context, host.siteId);
    }
  }

  private rule(rule: HostStateRecord['fixedRules'][number]): ActiveFixedRuleSummary {
    return {
      artistId: rule.artistId,
      artistNickname: rule.artist.nickname,
      durationMinutes: rule.durationMinutes,
      id: rule.id,
      rowVersion: rule.rowVersion,
      startMinute: rule.startMinute,
      validFrom: formatDateOnly(rule.validFrom),
      weekdays: rule.weekdays.map(({ isoWeekday }) => isoWeekday),
    };
  }

  private request(request: HostStateRecord['fixedRequests'][number]): PendingFixedRequestSummary {
    if (!['CANCEL', 'CHANGE', 'CREATE'].includes(request.requestType)) {
      throw new FixedRequestStateConflictError();
    }
    return {
      effectiveFrom: formatDateOnly(request.effectiveFrom),
      id: request.id,
      requestType: request.requestType as PendingFixedRequestSummary['requestType'],
      rowVersion: request.rowVersion,
      targetArtistId: request.targetArtistId,
      targetDurationMinutes: request.targetDurationMinutes,
      targetStartMinute: request.targetStartMinute,
      targetWeekdays: request.targetWeekdays,
    };
  }

  private managedHost(host: ManagedHostRecord): ManagedHostSummary {
    if (!['ACTIVE', 'CANCELLED', 'SUSPENDED'].includes(host.qualificationStatus)) {
      throw new FixedRequestStateConflictError();
    }
    return {
      activeRule: host.fixedRules[0] ? this.rule(host.fixedRules[0]) : null,
      bookingAvailability: this.bookingAvailability(host),
      hostCode: host.hostCode,
      hostId: host.id,
      hostName: host.nickname ?? host.realName,
      pendingRequest: host.fixedRequests[0] ? this.request(host.fixedRequests[0]) : null,
      qualificationStatus: host.qualificationStatus as ManagedHostSummary['qualificationStatus'],
      siteId: host.siteId,
      siteName: host.site.name,
    };
  }

  private bookingAvailability(host: ManagedHostRecord): ManagedHostBookingAvailability {
    if (host.qualificationStatus !== 'ACTIVE') return 'QUALIFICATION_BLOCKED';
    if (host.site.status !== 'ACTIVE') return 'SITE_INACTIVE';
    return host.leaveRecords.length > 0 ? 'ON_LEAVE' : 'AVAILABLE';
  }

  private displayFixedRules(asOf: Date) {
    return {
      ...HOST_STATE_SELECT.fixedRules,
      orderBy: { validFrom: 'desc' as const },
      where: {
        OR: [{ status: 'ACTIVE' }, this.currentRuleScope(asOf)],
      },
    };
  }

  private currentRuleScope(asOf: Date): Prisma.FixedAppointmentRuleWhereInput {
    return {
      validFrom: { lte: asOf },
      OR: [{ validUntil: null }, { validUntil: { gt: asOf } }],
    };
  }

  private myFixedRelation(record: MyFixedRelationRecord): MyFixedRelationSummary {
    return {
      artistId: record.artistId,
      artistNickname: record.artist.nickname || record.artist.realName,
      durationMinutes: record.durationMinutes,
      hostCode: record.host.hostCode,
      hostId: record.hostId,
      hostName: record.host.nickname ?? record.host.realName,
      id: record.id,
      siteId: record.siteId,
      siteName: record.site.name,
      startMinute: record.startMinute,
      validFrom: formatDateOnly(record.validFrom),
      validUntil: record.validUntil ? formatDateOnly(record.validUntil) : null,
      weekdays: record.weekdays.map(({ isoWeekday }) => isoWeekday),
    };
  }
}
