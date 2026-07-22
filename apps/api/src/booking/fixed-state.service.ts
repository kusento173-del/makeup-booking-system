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
}
