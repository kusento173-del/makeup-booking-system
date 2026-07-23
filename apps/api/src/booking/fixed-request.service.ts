import { createHash } from 'node:crypto';

import { Prisma } from '@makeup/database';
import { Injectable } from '@nestjs/common';

import { AuditCommandService } from '../audit/audit-command.service';
import { AuthorizationPolicyService } from '../auth/authorization-policy.service';
import { DatabaseService } from '../database/database.service';
import { acquireTransactionLock } from '../database/transaction-lock';
import { formatDateOnly } from '../shift/business-date';
import {
  BookingIdempotencyConflictError,
  BookingIdempotencyIncompleteError,
  BookingIdempotencyKeyInvalidError,
} from './booking-create.errors';
import { validateBookingStart } from './booking-time';
import {
  FixedAvailabilityService,
  validateFixedAvailabilityInput,
  validateFixedEffectiveDate,
} from './fixed-availability.service';
import {
  FixedRequestReasonInvalidError,
  FixedRequestStateConflictError,
  FixedRequestUnavailableError,
} from './fixed-request.errors';
import type {
  CancelFixedRequestCommand,
  ChangeFixedRequestCommand,
  CreateFixedRequestCommand,
  FixedRequestCommandContext,
  FixedRequestCreateResult,
  FixedRequestSummary,
  SubmitFixedRequestCommand,
} from './fixed-request.types';

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;

const REQUEST_SELECT = {
  currentRuleId: true,
  effectiveFrom: true,
  hostId: true,
  id: true,
  reason: true,
  requestType: true,
  rowVersion: true,
  siteId: true,
  status: true,
  submittedAt: true,
  submittedByOperatorId: true,
  targetArtistId: true,
  targetDurationMinutes: true,
  targetStartMinute: true,
  targetWeekdays: true,
} satisfies Prisma.FixedAppointmentRequestSelect;

type RequestRecord = Prisma.FixedAppointmentRequestGetPayload<{ select: typeof REQUEST_SELECT }>;
type TargetCommand = Extract<SubmitFixedRequestCommand, { requestType: 'CHANGE' | 'CREATE' }>;

@Injectable()
export class FixedRequestService {
  constructor(
    private readonly audit: AuditCommandService,
    private readonly authorization: AuthorizationPolicyService,
    private readonly availability: FixedAvailabilityService,
    private readonly database: DatabaseService,
  ) {}

  create(
    context: FixedRequestCommandContext,
    command: CreateFixedRequestCommand,
    now = new Date(),
  ): Promise<FixedRequestCreateResult> {
    return this.submit(context, { ...command, requestType: 'CREATE' }, now);
  }

  change(
    context: FixedRequestCommandContext,
    command: ChangeFixedRequestCommand,
    now = new Date(),
  ): Promise<FixedRequestCreateResult> {
    return this.submit(context, { ...command, requestType: 'CHANGE' }, now);
  }

  cancel(
    context: FixedRequestCommandContext,
    command: CancelFixedRequestCommand,
    now = new Date(),
  ): Promise<FixedRequestCreateResult> {
    return this.submit(context, { ...command, requestType: 'CANCEL' }, now);
  }

  private submit(
    context: FixedRequestCommandContext,
    command: SubmitFixedRequestCommand,
    now: Date,
  ): Promise<FixedRequestCreateResult> {
    this.authorization.assertRole(context, ['OPERATOR']);
    const normalizedCommand = this.normalize(command, now);
    const scope = `FIXED_REQUEST_${normalizedCommand.requestType}`;
    const requestHash = this.requestHash(normalizedCommand);

    return this.database
      .transaction(async (transaction) => {
        await this.lock(transaction, context.userId, scope, normalizedCommand);
        const replay = await this.prepareIdempotency(
          transaction,
          context.userId,
          scope,
          normalizedCommand.idempotencyKey,
          requestHash,
          now,
        );
        if (replay) return { replayed: true, request: replay };

        await this.assertCurrentRule(transaction, context, normalizedCommand);
        if (normalizedCommand.requestType !== 'CANCEL') {
          await this.assertTargetAvailable(transaction, context, normalizedCommand, now);
        } else {
          await this.assertOperatorRelation(transaction, context, normalizedCommand);
        }
        const operator = await transaction.operatorProfile.findUnique({
          select: { employmentStatus: true, id: true, siteId: true },
          where: { userId: context.userId },
        });
        if (
          !operator ||
          operator.employmentStatus !== 'ACTIVE' ||
          operator.siteId !== context.siteId
        ) {
          throw new FixedRequestStateConflictError();
        }

        const request = await transaction.fixedAppointmentRequest.create({
          data: {
            currentRuleId:
              normalizedCommand.requestType === 'CREATE' ? null : normalizedCommand.currentRuleId,
            effectiveFrom: normalizedCommand.effectiveFrom,
            hostId: normalizedCommand.hostId,
            reason: normalizedCommand.reason,
            requestType: normalizedCommand.requestType,
            siteId: operator.siteId,
            submittedByOperatorId: operator.id,
            submittedByUserId: context.userId,
            targetArtistId:
              normalizedCommand.requestType === 'CANCEL' ? null : normalizedCommand.artistId,
            targetDurationMinutes:
              normalizedCommand.requestType === 'CANCEL' ? null : normalizedCommand.durationMinutes,
            targetStartMinute:
              normalizedCommand.requestType === 'CANCEL' ? null : normalizedCommand.startMinute,
            targetWeekdays:
              normalizedCommand.requestType === 'CANCEL' ? [] : [...normalizedCommand.weekdays],
          },
          select: REQUEST_SELECT,
        });
        const summary = this.toSummary(request);
        await this.recordSideEffects(transaction, context, summary);
        await this.completeIdempotency(
          transaction,
          context.userId,
          scope,
          normalizedCommand.idempotencyKey,
          summary.id,
        );
        return { replayed: false, request: summary };
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

  private normalize(command: SubmitFixedRequestCommand, now: Date): SubmitFixedRequestCommand {
    const reason = this.normalizeReason(command.reason);
    const idempotencyKey = this.normalizeIdempotencyKey(command.idempotencyKey);
    if (command.requestType === 'CANCEL') {
      validateFixedEffectiveDate(command.effectiveFrom, now);
      return { ...command, idempotencyKey, reason };
    }
    validateBookingStart(command.startMinute, command.durationMinutes);
    const weekdays = validateFixedAvailabilityInput(
      {
        artistId: command.artistId,
        durationMinutes: command.durationMinutes,
        hostId: command.hostId,
        requestedStartDate: command.effectiveFrom,
        weekdays: command.weekdays,
      },
      now,
    );
    return { ...command, idempotencyKey, reason, weekdays };
  }

  private async assertCurrentRule(
    transaction: Prisma.TransactionClient,
    context: FixedRequestCommandContext,
    command: SubmitFixedRequestCommand,
  ): Promise<void> {
    if (command.requestType === 'CREATE') return;
    const rule = await transaction.fixedAppointmentRule.findUnique({
      select: { artistId: true, hostId: true, siteId: true, status: true, validFrom: true },
      where: { id: command.currentRuleId },
    });
    if (
      !rule ||
      rule.hostId !== command.hostId ||
      rule.siteId !== context.siteId ||
      rule.status !== 'ACTIVE' ||
      rule.validFrom >= command.effectiveFrom ||
      (command.requestType === 'CHANGE' && rule.artistId !== command.artistId)
    ) {
      throw new FixedRequestUnavailableError();
    }
  }

  private async assertTargetAvailable(
    transaction: Prisma.TransactionClient,
    context: FixedRequestCommandContext,
    command: TargetCommand,
    now: Date,
  ): Promise<void> {
    const availability = await this.availability.getAvailabilityWithClient(
      transaction,
      context,
      {
        artistId: command.artistId,
        durationMinutes: command.durationMinutes,
        hostId: command.hostId,
        requestedStartDate: command.effectiveFrom,
        weekdays: command.weekdays,
      },
      now,
      command.requestType === 'CHANGE' ? { excludeRuleId: command.currentRuleId } : {},
    );
    const selected = availability.slots.find((slot) => slot.startMinute === command.startMinute);
    if (
      availability.unavailableReason !== null ||
      !selected?.available ||
      selected.earliestStartDate !== formatDateOnly(command.effectiveFrom)
    ) {
      throw new FixedRequestUnavailableError();
    }
  }

  private async assertOperatorRelation(
    transaction: Prisma.TransactionClient,
    context: FixedRequestCommandContext,
    command: Extract<SubmitFixedRequestCommand, { requestType: 'CANCEL' }>,
  ): Promise<void> {
    const relation = await transaction.hostOperatorRelation.findFirst({
      select: { id: true },
      where: {
        hostId: command.hostId,
        operator: {
          employmentStatus: 'ACTIVE',
          siteId: context.siteId ?? '__NO_SITE__',
          userId: context.userId,
        },
        validFrom: { lte: command.effectiveFrom },
        OR: [{ validUntil: null }, { validUntil: { gt: command.effectiveFrom } }],
      },
    });
    if (!relation) throw new FixedRequestUnavailableError();
  }

  private async lock(
    transaction: Prisma.TransactionClient,
    userId: string,
    scope: string,
    command: SubmitFixedRequestCommand,
  ): Promise<void> {
    const keys = new Set<string>([
      `fixed:host:${command.hostId}`,
      `idempotency:${userId}:${scope}:${command.idempotencyKey}`,
    ]);
    if (command.requestType !== 'CREATE') keys.add(`fixed:rule:${command.currentRuleId}`);
    if (command.requestType !== 'CANCEL') {
      for (const weekday of command.weekdays) {
        for (
          let minute = command.startMinute;
          minute < command.startMinute + command.durationMinutes;
          minute += 15
        ) {
          keys.add(`fixed:artist:${command.artistId}:${weekday}:${minute}`);
          keys.add(`fixed:host:${command.hostId}:${weekday}:${minute}`);
        }
      }
    }
    for (const key of [...keys].sort()) await acquireTransactionLock(transaction, key);
  }

  private normalizeReason(value: string): string {
    const reason = value.normalize('NFKC').trim();
    if (!reason || reason.length > 500) throw new FixedRequestReasonInvalidError();
    return reason;
  }

  private normalizeIdempotencyKey(value: string): string {
    const normalized = value.normalize('NFKC').trim();
    if (!IDEMPOTENCY_KEY_PATTERN.test(normalized)) {
      throw new BookingIdempotencyKeyInvalidError();
    }
    return normalized;
  }

  private requestHash(command: SubmitFixedRequestCommand): string {
    if (command.requestType === 'CREATE') {
      return createHash('sha256')
        .update(
          JSON.stringify({
            artistId: command.artistId,
            durationMinutes: command.durationMinutes,
            effectiveFrom: formatDateOnly(command.effectiveFrom),
            hostId: command.hostId,
            reason: command.reason,
            startMinute: command.startMinute,
            weekdays: command.weekdays,
          }),
        )
        .digest('hex');
    }
    return createHash('sha256')
      .update(
        JSON.stringify({
          currentRuleId: command.currentRuleId,
          effectiveFrom: formatDateOnly(command.effectiveFrom),
          hostId: command.hostId,
          reason: command.reason,
          requestType: command.requestType,
          ...(command.requestType === 'CANCEL'
            ? {}
            : {
                artistId: command.artistId,
                durationMinutes: command.durationMinutes,
                startMinute: command.startMinute,
                weekdays: command.weekdays,
              }),
        }),
      )
      .digest('hex');
  }

  private async prepareIdempotency(
    transaction: Prisma.TransactionClient,
    userId: string,
    scope: string,
    idempotencyKey: string,
    requestHash: string,
    now: Date,
  ): Promise<FixedRequestSummary | null> {
    const where = { userId_scope_idempotencyKey: { idempotencyKey, scope, userId } };
    const existing = await transaction.idempotencyRecord.findUnique({ where });
    if (existing && existing.expiresAt <= now) {
      await transaction.idempotencyRecord.delete({ where });
    } else if (existing) {
      if (existing.requestHash !== requestHash) throw new BookingIdempotencyConflictError();
      if (existing.resourceType !== 'FIXED_REQUEST' || !existing.resourceId) {
        throw new BookingIdempotencyIncompleteError();
      }
      const request = await transaction.fixedAppointmentRequest.findUnique({
        select: REQUEST_SELECT,
        where: { id: existing.resourceId },
      });
      if (!request) throw new BookingIdempotencyIncompleteError();
      return this.toSummary(request);
    }
    await transaction.idempotencyRecord.create({
      data: {
        expiresAt: new Date(now.getTime() + 24 * 60 * 60_000),
        idempotencyKey,
        requestHash,
        scope,
        userId,
      },
    });
    return null;
  }

  private async completeIdempotency(
    transaction: Prisma.TransactionClient,
    userId: string,
    scope: string,
    idempotencyKey: string,
    requestId: string,
  ): Promise<void> {
    const updated = await transaction.idempotencyRecord.updateMany({
      data: {
        resourceId: requestId,
        resourceType: 'FIXED_REQUEST',
        responseBody: { requestId },
        responseStatus: 201,
      },
      where: { idempotencyKey, resourceId: null, scope, userId },
    });
    if (updated.count !== 1) throw new FixedRequestStateConflictError();
  }

  private async recordSideEffects(
    transaction: Prisma.TransactionClient,
    context: FixedRequestCommandContext,
    request: FixedRequestSummary,
  ): Promise<void> {
    await this.audit.append(transaction, context, {
      action: 'FIXED_APPOINTMENT_REQUEST_SUBMITTED',
      afterData: {
        currentRuleId: request.currentRuleId,
        effectiveFrom: request.effectiveFrom,
        hostId: request.hostId,
        requestType: request.requestType,
        status: request.status,
        targetArtistId: request.targetArtistId,
        targetDurationMinutes: request.targetDurationMinutes,
        targetStartMinute: request.targetStartMinute,
        targetWeekdays: request.targetWeekdays,
      },
      objectId: request.id,
      objectType: 'FIXED_APPOINTMENT_REQUEST',
      reason: request.reason,
      siteId: request.siteId,
    });
  }

  private toSummary(request: RequestRecord): FixedRequestSummary {
    if (
      !['CANCEL', 'CHANGE', 'CREATE'].includes(request.requestType) ||
      request.status !== 'PENDING' ||
      (request.requestType === 'CREATE' && request.currentRuleId !== null) ||
      (request.requestType !== 'CREATE' && request.currentRuleId === null) ||
      (request.requestType === 'CANCEL' &&
        (request.targetArtistId !== null ||
          request.targetStartMinute !== null ||
          request.targetDurationMinutes !== null ||
          request.targetWeekdays.length !== 0)) ||
      (request.requestType !== 'CANCEL' &&
        (!request.targetArtistId ||
          request.targetStartMinute === null ||
          request.targetDurationMinutes === null ||
          request.targetWeekdays.length === 0))
    ) {
      throw new FixedRequestStateConflictError();
    }
    return {
      currentRuleId: request.currentRuleId,
      effectiveFrom: formatDateOnly(request.effectiveFrom),
      hostId: request.hostId,
      id: request.id,
      reason: request.reason,
      requestType: request.requestType as FixedRequestSummary['requestType'],
      rowVersion: request.rowVersion,
      siteId: request.siteId,
      status: 'PENDING',
      submittedAt: request.submittedAt.toISOString(),
      submittedByOperatorId: request.submittedByOperatorId,
      targetArtistId: request.targetArtistId,
      targetDurationMinutes: request.targetDurationMinutes,
      targetStartMinute: request.targetStartMinute,
      targetWeekdays: request.targetWeekdays,
    };
  }
}
