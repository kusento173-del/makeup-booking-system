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
} from './fixed-availability.service';
import {
  FixedRequestReasonInvalidError,
  FixedRequestStateConflictError,
  FixedRequestUnavailableError,
} from './fixed-request.errors';
import type {
  CreateFixedRequestCommand,
  FixedRequestCommandContext,
  FixedRequestCreateResult,
  FixedRequestSummary,
} from './fixed-request.types';

const IDEMPOTENCY_SCOPE = 'FIXED_REQUEST_CREATE';
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;

const REQUEST_SELECT = {
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
    this.authorization.assertRole(context, ['OPERATOR']);
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
    const reason = this.normalizeReason(command.reason);
    const idempotencyKey = this.normalizeIdempotencyKey(command.idempotencyKey);
    const normalizedCommand = { ...command, idempotencyKey, reason, weekdays };
    const requestHash = this.requestHash(normalizedCommand);

    return this.database
      .transaction(async (transaction) => {
        await this.lock(transaction, context.userId, normalizedCommand);
        const replay = await this.prepareIdempotency(
          transaction,
          context.userId,
          idempotencyKey,
          requestHash,
          now,
        );
        if (replay) return { replayed: true, request: replay };

        const availability = await this.availability.getAvailabilityWithClient(
          transaction,
          context,
          {
            artistId: normalizedCommand.artistId,
            durationMinutes: normalizedCommand.durationMinutes,
            hostId: normalizedCommand.hostId,
            requestedStartDate: normalizedCommand.effectiveFrom,
            weekdays,
          },
          now,
        );
        const selected = availability.slots.find(
          (slot) => slot.startMinute === normalizedCommand.startMinute,
        );
        if (
          availability.unavailableReason !== null ||
          !selected?.available ||
          selected.earliestStartDate !== formatDateOnly(normalizedCommand.effectiveFrom)
        ) {
          throw new FixedRequestUnavailableError();
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
            effectiveFrom: normalizedCommand.effectiveFrom,
            hostId: normalizedCommand.hostId,
            reason,
            requestType: 'CREATE',
            siteId: operator.siteId,
            submittedByOperatorId: operator.id,
            submittedByUserId: context.userId,
            targetArtistId: normalizedCommand.artistId,
            targetDurationMinutes: normalizedCommand.durationMinutes,
            targetStartMinute: normalizedCommand.startMinute,
            targetWeekdays: [...weekdays],
          },
          select: REQUEST_SELECT,
        });
        const summary = this.toSummary(request);
        await this.recordSideEffects(transaction, context, summary);
        await this.completeIdempotency(transaction, context.userId, idempotencyKey, summary.id);
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

  private async lock(
    transaction: Prisma.TransactionClient,
    userId: string,
    command: CreateFixedRequestCommand,
  ): Promise<void> {
    const keys = new Set<string>([
      `fixed:host:${command.hostId}`,
      `idempotency:${userId}:${IDEMPOTENCY_SCOPE}:${command.idempotencyKey}`,
    ]);
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

  private requestHash(command: CreateFixedRequestCommand): string {
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

  private async prepareIdempotency(
    transaction: Prisma.TransactionClient,
    userId: string,
    idempotencyKey: string,
    requestHash: string,
    now: Date,
  ): Promise<FixedRequestSummary | null> {
    const where = {
      userId_scope_idempotencyKey: { idempotencyKey, scope: IDEMPOTENCY_SCOPE, userId },
    };
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
        scope: IDEMPOTENCY_SCOPE,
        userId,
      },
    });
    return null;
  }

  private async completeIdempotency(
    transaction: Prisma.TransactionClient,
    userId: string,
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
      where: {
        idempotencyKey,
        resourceId: null,
        scope: IDEMPOTENCY_SCOPE,
        userId,
      },
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
    await transaction.outboxEvent.create({
      data: {
        aggregateId: request.id,
        aggregateType: 'FIXED_REQUEST',
        eventType: 'FIXED_APPOINTMENT_REQUEST_SUBMITTED',
        payload: {
          artistId: request.targetArtistId,
          hostId: request.hostId,
          requestId: request.id,
          siteId: request.siteId,
          submittedByOperatorId: request.submittedByOperatorId,
        },
      },
    });
  }

  private toSummary(request: RequestRecord): FixedRequestSummary {
    if (
      request.requestType !== 'CREATE' ||
      request.status !== 'PENDING' ||
      !request.targetArtistId ||
      request.targetStartMinute === null ||
      request.targetDurationMinutes === null
    ) {
      throw new FixedRequestStateConflictError();
    }
    return {
      effectiveFrom: formatDateOnly(request.effectiveFrom),
      hostId: request.hostId,
      id: request.id,
      reason: request.reason,
      requestType: 'CREATE',
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
