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
  currentRuleId: true,
  effectiveFrom: true,
  hostId: true,
  id: true,
  reason: true,
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

const RULE_SELECT = {
  artistId: true,
  durationMinutes: true,
  hostId: true,
  id: true,
  siteId: true,
  startMinute: true,
  status: true,
  validFrom: true,
  weekdays: { select: { isoWeekday: true } },
} satisfies Prisma.FixedAppointmentRuleSelect;

const APPOINTMENT_SELECT = {
  appointmentDate: true,
  artistId: true,
  hostId: true,
  id: true,
  rowVersion: true,
  siteId: true,
  status: true,
} satisfies Prisma.AppointmentSelect;

type ReviewRecord = Prisma.FixedAppointmentRequestGetPayload<{ select: typeof REVIEW_SELECT }>;
type RuleRecord = Prisma.FixedAppointmentRuleGetPayload<{ select: typeof RULE_SELECT }>;
type AppointmentRecord = Prisma.AppointmentGetPayload<{ select: typeof APPOINTMENT_SELECT }>;

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

        const currentRule =
          command.decision === 'APPROVE'
            ? await this.validateApproval(transaction, context, request, now)
            : null;
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

        let cancelledAppointmentCount = 0;
        if (command.decision === 'APPROVE' && currentRule) {
          await this.endRule(transaction, request, currentRule);
          cancelledAppointmentCount = await this.cancelFutureAppointments(
            transaction,
            context,
            request,
            currentRule,
            now,
          );
        }
        const fixedRuleId =
          command.decision === 'APPROVE' && request.requestType !== 'CANCEL'
            ? await this.createRule(transaction, request)
            : null;
        const result: FixedRequestReviewResult = {
          cancelledAppointmentCount,
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
  ): Promise<RuleRecord | null> {
    if (request.effectiveFrom <= toBusinessDate(now)) throw new FixedRequestUnavailableError();
    const currentRule = await this.currentRule(transaction, request);
    const target = request.requestType === 'CANCEL' ? null : this.target(request);
    const appointments = currentRule
      ? await transaction.appointment.findMany({
          select: APPOINTMENT_SELECT,
          where: {
            appointmentDate: { gte: request.effectiveFrom },
            fixedRuleId: currentRule.id,
            status: 'BOOKED',
          },
        })
      : [];
    await this.lockSchedule(transaction, request, currentRule, target, appointments);

    if (target) {
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
        {
          ...(currentRule ? { excludeRuleId: currentRule.id } : {}),
          excludeRequestId: request.id,
        },
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
    return currentRule;
  }

  private async currentRule(
    transaction: Prisma.TransactionClient,
    request: ReviewRecord,
  ): Promise<RuleRecord | null> {
    if (request.requestType === 'CREATE') {
      if (request.currentRuleId !== null) throw new FixedRequestStateConflictError();
      return null;
    }
    if (!request.currentRuleId) throw new FixedRequestStateConflictError();
    const rule = await transaction.fixedAppointmentRule.findUnique({
      select: RULE_SELECT,
      where: { id: request.currentRuleId },
    });
    if (
      !rule ||
      rule.hostId !== request.hostId ||
      rule.siteId !== request.siteId ||
      rule.status !== 'ACTIVE' ||
      rule.validFrom >= request.effectiveFrom ||
      (request.requestType === 'CHANGE' && rule.artistId !== request.targetArtistId)
    ) {
      throw new FixedRequestUnavailableError();
    }
    return rule;
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

  private async endRule(
    transaction: Prisma.TransactionClient,
    request: ReviewRecord,
    rule: RuleRecord,
  ): Promise<void> {
    const ended = await transaction.fixedAppointmentRule.updateMany({
      data: {
        endedByRequestId: request.id,
        rowVersion: { increment: 1 },
        status: 'ENDED',
        validUntil: request.effectiveFrom,
      },
      where: { id: rule.id, status: 'ACTIVE' },
    });
    if (ended.count !== 1) throw new FixedRequestStateConflictError();
    const weekdays = await transaction.fixedAppointmentRuleWeekday.updateMany({
      data: { validUntil: request.effectiveFrom },
      where: { ruleId: rule.id, validUntil: null },
    });
    if (weekdays.count !== rule.weekdays.length) throw new FixedRequestStateConflictError();
  }

  private async cancelFutureAppointments(
    transaction: Prisma.TransactionClient,
    context: FixedRequestCommandContext,
    request: ReviewRecord,
    rule: RuleRecord,
    now: Date,
  ): Promise<number> {
    const appointments = await transaction.appointment.findMany({
      orderBy: [{ appointmentDate: 'asc' }, { id: 'asc' }],
      select: APPOINTMENT_SELECT,
      where: {
        appointmentDate: { gte: request.effectiveFrom },
        fixedRuleId: rule.id,
        status: 'BOOKED',
      },
    });
    let cancelled = 0;
    for (const appointment of appointments) {
      const updated = await transaction.appointment.updateMany({
        data: {
          cancellationReasonCode:
            request.requestType === 'CHANGE' ? 'FIXED_RULE_CHANGED' : 'FIXED_RULE_CANCELLED',
          cancellationReasonText: request.reason,
          cancellationSourceId: request.id,
          cancellationSourceType: 'FIXED_REQUEST',
          cancelledAt: now,
          cancelledByUserId: context.userId,
          rowVersion: { increment: 1 },
          status: 'CANCELLED',
        },
        where: { id: appointment.id, rowVersion: appointment.rowVersion, status: 'BOOKED' },
      });
      if (updated.count !== 1) throw new FixedRequestStateConflictError();
      await this.recordAppointmentCancellation(transaction, context, request, appointment, now);
      cancelled += 1;
    }
    return cancelled;
  }

  private async recordAppointmentCancellation(
    transaction: Prisma.TransactionClient,
    context: FixedRequestCommandContext,
    request: ReviewRecord,
    appointment: AppointmentRecord,
    now: Date,
  ): Promise<void> {
    await this.audit.append(transaction, context, {
      action: 'FIXED_APPOINTMENT_CANCELLED_BY_RULE_REQUEST',
      afterData: {
        cancelledAt: now.toISOString(),
        cancellationSourceId: request.id,
        rowVersion: appointment.rowVersion + 1,
        status: 'CANCELLED',
      },
      beforeData: { rowVersion: appointment.rowVersion, status: appointment.status },
      objectId: appointment.id,
      objectType: 'APPOINTMENT',
      reason: request.reason,
      siteId: appointment.siteId,
    });
  }

  private target(request: ReviewRecord) {
    if (
      request.requestType === 'CANCEL' ||
      !['CHANGE', 'CREATE'].includes(request.requestType) ||
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

  private async lockSchedule(
    transaction: Prisma.TransactionClient,
    request: ReviewRecord,
    currentRule: RuleRecord | null,
    target: ReturnType<FixedRequestReviewService['target']> | null,
    appointments: readonly AppointmentRecord[],
  ): Promise<void> {
    const keys = new Set<string>([`fixed:host:${request.hostId}`]);
    if (currentRule) {
      keys.add(`fixed:rule:${currentRule.id}`);
      this.addSlotLocks(
        keys,
        currentRule.hostId,
        currentRule.artistId,
        currentRule.weekdays.map(({ isoWeekday }) => isoWeekday),
        currentRule.startMinute,
        currentRule.durationMinutes,
      );
    }
    if (target) {
      this.addSlotLocks(
        keys,
        request.hostId,
        target.artistId,
        request.targetWeekdays,
        target.startMinute,
        target.durationMinutes,
      );
    }
    for (const appointment of appointments) {
      const date = formatDateOnly(appointment.appointmentDate);
      keys.add(`appointment:artist:${appointment.artistId}:${date}`);
      keys.add(`appointment:host:${appointment.hostId}:${date}`);
    }
    for (const key of [...keys].sort()) await acquireTransactionLock(transaction, key);
  }

  private addSlotLocks(
    keys: Set<string>,
    hostId: string,
    artistId: string,
    weekdays: readonly number[],
    startMinute: number,
    durationMinutes: number,
  ): void {
    for (const weekday of weekdays) {
      for (let minute = startMinute; minute < startMinute + durationMinutes; minute += 15) {
        keys.add(`fixed:artist:${artistId}:${weekday}:${minute}`);
        keys.add(`fixed:host:${hostId}:${weekday}:${minute}`);
      }
    }
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
        cancelledAppointmentCount: result.cancelledAppointmentCount,
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
  }
}
