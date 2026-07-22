import { Prisma } from '@makeup/database';
import { Injectable } from '@nestjs/common';

import { AuthorizationPolicyService } from '../auth/authorization-policy.service';
import type { VerifiedAuthorizationContext } from '../auth/authorization.types';
import { DatabaseService } from '../database/database.service';
import { formatDateOnly, toBusinessDate } from '../shift/business-date';
import { FixedRequestStateConflictError } from './fixed-request.errors';
import type {
  FixedRequestListInput,
  FixedRequestListItem,
  FixedRequestPage,
  FixedRequestStatus,
  FixedRequestType,
} from './fixed-request-query.types';

const REQUEST_SELECT = {
  effectiveFrom: true,
  host: { select: { hostCode: true, nickname: true, realName: true } },
  hostId: true,
  id: true,
  reason: true,
  requestType: true,
  reviewComment: true,
  reviewedAt: true,
  rowVersion: true,
  site: { select: { name: true } },
  siteId: true,
  status: true,
  submittedAt: true,
  submittedByOperator: { select: { realName: true } },
  submittedByOperatorId: true,
  targetArtist: { select: { nickname: true } },
  targetArtistId: true,
  targetDurationMinutes: true,
  targetStartMinute: true,
  targetWeekdays: true,
} satisfies Prisma.FixedAppointmentRequestSelect;

type RequestRecord = Prisma.FixedAppointmentRequestGetPayload<{ select: typeof REQUEST_SELECT }>;

@Injectable()
export class FixedRequestQueryService {
  constructor(
    private readonly authorization: AuthorizationPolicyService,
    private readonly database: DatabaseService,
  ) {}

  list(
    context: VerifiedAuthorizationContext,
    input: FixedRequestListInput,
    now = new Date(),
  ): Promise<FixedRequestPage> {
    this.authorization.assertRole(context, ['OPERATOR', 'CUSTOMER_SERVICE', 'ADMIN']);
    const where = this.scope(context, input, toBusinessDate(now));
    return this.database.read(async (client) => {
      const [records, total] = await Promise.all([
        client.fixedAppointmentRequest.findMany({
          orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }],
          select: REQUEST_SELECT,
          skip: (input.page - 1) * input.pageSize,
          take: input.pageSize,
          where,
        }),
        client.fixedAppointmentRequest.count({ where }),
      ]);
      return {
        items: records.map((record) => this.toItem(record)),
        page: input.page,
        pageSize: input.pageSize,
        total,
      };
    });
  }

  private scope(
    context: VerifiedAuthorizationContext,
    input: FixedRequestListInput,
    today: Date,
  ): Prisma.FixedAppointmentRequestWhereInput {
    const filters: Prisma.FixedAppointmentRequestWhereInput = {
      ...(input.requestType ? { requestType: input.requestType } : {}),
      ...(input.status ? { status: input.status } : {}),
    };
    if (context.roleCode === 'ADMIN') return filters;
    if (context.roleCode === 'CUSTOMER_SERVICE') {
      return { ...filters, siteId: context.siteId ?? '__NO_SITE__' };
    }
    return {
      ...filters,
      OR: [
        { submittedByUserId: context.userId },
        {
          host: {
            operatorRelations: {
              some: {
                operator: {
                  employmentStatus: 'ACTIVE',
                  userId: context.userId,
                },
                validFrom: { lte: today },
                OR: [{ validUntil: null }, { validUntil: { gt: today } }],
              },
            },
          },
        },
      ],
    };
  }

  private toItem(record: RequestRecord): FixedRequestListItem {
    if (!this.requestType(record.requestType) || !this.status(record.status)) {
      throw new FixedRequestStateConflictError();
    }
    return {
      effectiveFrom: formatDateOnly(record.effectiveFrom),
      hostCode: record.host.hostCode,
      hostId: record.hostId,
      hostName: record.host.nickname ?? record.host.realName,
      id: record.id,
      reason: record.reason,
      requestType: record.requestType,
      reviewComment: record.reviewComment,
      reviewedAt: record.reviewedAt?.toISOString() ?? null,
      rowVersion: record.rowVersion,
      siteId: record.siteId,
      siteName: record.site.name,
      status: record.status,
      submittedAt: record.submittedAt.toISOString(),
      submittedByOperatorId: record.submittedByOperatorId,
      submittedByOperatorName: record.submittedByOperator.realName,
      targetArtistId: record.targetArtistId,
      targetArtistNickname: record.targetArtist?.nickname ?? null,
      targetDurationMinutes: record.targetDurationMinutes,
      targetStartMinute: record.targetStartMinute,
      targetWeekdays: record.targetWeekdays,
    };
  }

  private requestType(value: string): value is FixedRequestType {
    return ['CANCEL', 'CHANGE', 'CREATE'].includes(value);
  }

  private status(value: string): value is FixedRequestStatus {
    return ['APPROVED', 'PENDING', 'REJECTED', 'WITHDRAWN'].includes(value);
  }
}
