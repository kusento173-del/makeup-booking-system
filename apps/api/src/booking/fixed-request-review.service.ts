import { Prisma } from '@makeup/database';
import { Injectable } from '@nestjs/common';

import { AuditCommandService } from '../audit/audit-command.service';
import { AuthorizationPolicyService } from '../auth/authorization-policy.service';
import { DatabaseService } from '../database/database.service';
import { acquireTransactionLock } from '../database/transaction-lock';
import { formatDateOnly, toBusinessDate } from '../shift/business-date';
import { FixedAvailabilityService } from './fixed-availability.service';
import {
  FixedRequestNotFoundError,
  FixedRequestReviewCommentInvalidError,
  FixedRequestStateConflictError,
  FixedRequestUnavailableError,
} from './fixed-request.errors';
import type {
  FixedRequestCommandContext,
  FixedRequestReviewResult,
  ReviewFixedRequestCommand,
} from './fixed-request.types';

const REVIEW_SELECT = {
  effectiveFrom: true,
  hostId: true,
  id: true,
  requestType: true,
  rowVersion: true,
  siteId: true,
  status: true,
  submittedByOperatorId: true,
  targetArtistId: true,
  targetDurationMinutes: true,
  targetStartMinute: true,
  targetWeekdays: true,
} satisfies Prisma.FixedAppointmentRequestSelect;

type ReviewRecord = Prisma.FixedAppointmentRequestGetPayload<{ select: typeof REVIEW_SELECT }>;

@Injectable()
export class FixedRequestReviewService {
  constructor(
    private readonly audit: AuditCommandService,
    private readonly authorization: AuthorizationPolicyService,
    private readonly availability: FixedAvailabilityService,
    private readonly database: DatabaseService,
  ) {}

  review(
    context: FixedRequestCommandContext,
    command: ReviewFixedRequestCommand,
    now = new Date(),
  ): Promise<FixedRequestReviewResult> {
    this.authorization.assertRole(context, ['CUSTOMER_SERVICE', 'ADMIN']);
    const comment = this.comment(command.decision, command.comment);
    return this.database
      .transaction(async (transaction) => {
        await acquireTransactionLock(transaction, `fixed:request:${command.requestId}`);
        const request = await transaction.fixedAppointmentRequest.findUnique({
          select: REVIEW_SELECT,
          where: { id: command.requestId },
        });
        if (!request) throw new FixedRequestNotFoundError();
        this.assertReviewable(context, command, request);

        if (command.decision === 'APPROVE') {
          await this.validateApproval(transaction, context, request, now);
        }
        const status = command.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
        const updated = await transaction.fixedAppointmentRequest.updateMany({
          data: {
            reviewComment: comment,
            reviewedAt: now,
            reviewedByUserId: context.userId,
            rowVersion: { increment: 1 },
            status,
          },
          where: {
            id: request.id,
            rowVersion: command.expectedRowVersion,
            status: 'PENDING',
          },
        });
        if (updated.count !== 1) throw new FixedRequestStateConflictError();

        const fixedRuleId =
          command.decision === 'APPROVE' ? await this.createRule(transaction, request) : null;
        const result: FixedRequestReviewResult = {
          fixedRuleId,
          id: request.id,
          reviewComment: comment,
          reviewedAt: now.toISOString(),
          rowVersion: command.expectedRowVersion + 1,
          status,
        };
        await this.recordSideEffects(transaction, context, request, result);
        return result;
      })
      .catch((error: unknown) => {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          ['P2002', 'P2004'].includes(error.code)
        ) {
          throw new FixedRequestUnavailableError();
        }
        throw error;
      });
  }

  private async validateApproval(
    transaction: Prisma.TransactionClient,
    context: FixedRequestCommandContext,
    request: ReviewRecord,
    now: Date,
  ): Promise<void> {
    const target = this.target(request);
    if (request.effectiveFrom <= toBusinessDate(now)) throw new FixedRequestUnavailableError();
    await this.lockTarget(transaction, request, target);
    const availability = await this.availability.getAvailabilityWithClient(
      transaction,
      context,
      {
        artistId: target.artistId,
        durationMinutes: target.durationMinutes,
        hostId: request.hostId,
        requestedStartDate: request.effectiveFrom,
        weekdays: request.targetWeekdays,
      },
      now,
      { excludeRequestId: request.id },
    );
    const slot = availability.slots.find((item) => item.startMinute === target.startMinute);
    if (
      availability.unavailableReason !== null ||
      !slot?.available ||
      slot.earliestStartDate !== formatDateOnly(request.effectiveFrom)
    ) {
      throw new FixedRequestUnavailableError();
    }
  }

  private async createRule(
    transaction: Prisma.TransactionClient,
    request: ReviewRecord,
  ): Promise<string> {
    const target = this.target(request);
    const rule = await transaction.fixedAppointmentRule.create({
      data: {
        artistId: target.artistId,
        durationMinutes: target.durationMinutes,
        hostId: request.hostId,
        siteId: request.siteId,
        sourceRequestId: request.id,
        startMinute: target.startMinute,
        validFrom: request.effectiveFrom,
      },
      select: { id: true },
    });
    await transaction.fixedAppointmentRuleWeekday.createMany({
      data: request.targetWeekdays.map((isoWeekday) => ({
        artistId: target.artistId,
        endMinute: target.startMinute + target.durationMinutes,
        hostId: request.hostId,
        isoWeekday,
        ruleId: rule.id,
        siteId: request.siteId,
        startMinute: target.startMinute,
        validFrom: request.effectiveFrom,
      })),
    });
    return rule.id;
  }

  private target(request: ReviewRecord) {
    if (
      request.requestType !== 'CREATE' ||
      !request.targetArtistId ||
      request.targetStartMinute === null ||
      request.targetDurationMinutes === null ||
      request.targetWeekdays.length === 0
    ) {
      throw new FixedRequestStateConflictError();
    }
    return {
      artistId: request.targetArtistId,
      durationMinutes: request.targetDurationMinutes,
      startMinute: request.targetStartMinute,
    };
  }

  private async lockTarget(
    transaction: Prisma.TransactionClient,
    request: ReviewRecord,
    target: ReturnType<FixedRequestReviewService['target']>,
  ): Promise<void> {
    const keys = new Set<string>([`fixed:host:${request.hostId}`]);
    for (const weekday of request.targetWeekdays) {
      for (
        let minute = target.startMinute;
        minute < target.startMinute + target.durationMinutes;
        minute += 15
      ) {
        keys.add(`fixed:artist:${target.artistId}:${weekday}:${minute}`);
        keys.add(`fixed:host:${request.hostId}:${weekday}:${minute}`);
      }
    }
    for (const key of [...keys].sort()) await acquireTransactionLock(transaction, key);
  }

  private assertReviewable(
    context: FixedRequestCommandContext,
    command: ReviewFixedRequestCommand,
    request: ReviewRecord,
  ): void {
    if (context.roleCode === 'CUSTOMER_SERVICE') {
      this.authorization.assertSiteScope(context, request.siteId);
    }
    if (request.status !== 'PENDING' || request.rowVersion !== command.expectedRowVersion) {
      throw new FixedRequestStateConflictError();
    }
  }

  private comment(decision: ReviewFixedRequestCommand['decision'], value: string | undefined) {
    const comment = value?.normalize('NFKC').trim() || null;
    if ((decision === 'REJECT' && !comment) || (comment && comment.length > 500)) {
      throw new FixedRequestReviewCommentInvalidError();
    }
    return comment;
  }

  private async recordSideEffects(
    transaction: Prisma.TransactionClient,
    context: FixedRequestCommandContext,
    request: ReviewRecord,
    result: FixedRequestReviewResult,
  ): Promise<void> {
    const eventType = `FIXED_APPOINTMENT_REQUEST_${result.status}`;
    await this.audit.append(transaction, context, {
      action: eventType,
      afterData: {
        fixedRuleId: result.fixedRuleId,
        reviewComment: result.reviewComment,
        status: result.status,
      },
      beforeData: { rowVersion: request.rowVersion, status: request.status },
      objectId: request.id,
      objectType: 'FIXED_APPOINTMENT_REQUEST',
      reason: result.reviewComment ?? undefined,
      siteId: request.siteId,
    });
    await transaction.outboxEvent.create({
      data: {
        aggregateId: request.id,
        aggregateType: 'FIXED_REQUEST',
        eventType,
        payload: {
          fixedRuleId: result.fixedRuleId,
          hostId: request.hostId,
          requestId: request.id,
          siteId: request.siteId,
          submittedByOperatorId: request.submittedByOperatorId,
        },
      },
    });
  }
}
