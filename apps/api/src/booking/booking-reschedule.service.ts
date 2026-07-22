import { createHash, randomUUID } from 'node:crypto';

import { Prisma } from '@makeup/database';
import { Injectable } from '@nestjs/common';

import { AuditCommandService } from '../audit/audit-command.service';
import {
  AuthorizationDeniedError,
  AuthorizationPolicyService,
} from '../auth/authorization-policy.service';
import { DatabaseService } from '../database/database.service';
import { acquireTransactionLock } from '../database/transaction-lock';
import { formatDateOnly, isoWeekdayForDate, toBusinessDate } from '../shift/business-date';
import {
  BookingAppointmentNotFoundError,
  BookingCancellationCutoffError,
  BookingCancellationReasonInvalidError,
  BookingSlotConflictError,
  BookingStateConflictError,
} from './booking-create.errors';
import { BookingCreateService } from './booking-create.service';
import type {
  BookingCancellationResult,
  BookingCommandContext,
  BookingRescheduleResult,
  RescheduleBookingCommand,
} from './booking-create.types';
import { validateBookingDate, validateBookingStart } from './booking-time';

const IDEMPOTENCY_SCOPE = 'APPOINTMENT_RESCHEDULE';
const ORIGINAL_SELECT = {
  appointmentDate: true,
  artistId: true,
  cancelledAt: true,
  fixedRuleId: true,
  host: { select: { userId: true } },
  hostId: true,
  id: true,
  rowVersion: true,
  siteId: true,
  status: true,
} satisfies Prisma.AppointmentSelect;

type OriginalAppointment = Prisma.AppointmentGetPayload<{ select: typeof ORIGINAL_SELECT }>;

@Injectable()
export class BookingRescheduleService {
  constructor(
    private readonly audit: AuditCommandService,
    private readonly authorization: AuthorizationPolicyService,
    private readonly creator: BookingCreateService,
    private readonly database: DatabaseService,
  ) {}

  reschedule(
    context: BookingCommandContext,
    command: RescheduleBookingCommand,
    now = new Date(),
  ): Promise<BookingRescheduleResult> {
    this.authorization.assertRole(context, ['HOST', 'OPERATOR', 'CUSTOMER_SERVICE', 'ADMIN']);
    validateBookingDate(command.date, now);
    validateBookingStart(command.startMinute, command.durationMinutes);
    const idempotencyKey = this.creator.normalizeIdempotencyKey(command.idempotencyKey);
    const reason = this.reason(context, command.reason);
    const requestHash = this.requestHash(command, reason);

    return this.database
      .transaction(async (transaction) => {
        const initial = await this.original(transaction, command.appointmentId);
        await this.lock(transaction, context.userId, initial, command, idempotencyKey);
        const replay = await this.creator.prepareIdempotency(
          transaction,
          context.userId,
          IDEMPOTENCY_SCOPE,
          idempotencyKey,
          requestHash,
          now,
        );
        if (replay) {
          const replayOriginal = await this.original(transaction, command.appointmentId);
          return {
            appointment: replay,
            original: this.cancelledSummary(replayOriginal),
            replayed: true,
          };
        }

        const original = await this.original(transaction, command.appointmentId);
        await this.assertActorScope(transaction, context, original);
        if (
          (context.roleCode === 'HOST' || context.roleCode === 'OPERATOR') &&
          original.appointmentDate <= toBusinessDate(now)
        ) {
          throw new BookingCancellationCutoffError();
        }
        if (original.status !== 'BOOKED' || original.rowVersion !== command.expectedRowVersion) {
          throw new BookingStateConflictError();
        }

        const replacementId = randomUUID();
        const cancelled = await transaction.appointment.updateMany({
          data: {
            cancellationReasonCode: 'RESCHEDULED',
            cancellationReasonText: reason ?? null,
            cancellationSourceId: replacementId,
            cancellationSourceType: 'APPOINTMENT',
            cancelledAt: now,
            cancelledByUserId: context.userId,
            rowVersion: { increment: 1 },
            status: 'CANCELLED',
          },
          where: {
            id: original.id,
            rowVersion: command.expectedRowVersion,
            status: 'BOOKED',
          },
        });
        if (cancelled.count !== 1) throw new BookingStateConflictError();

        const appointment = await this.creator.createFresh(
          transaction,
          context,
          {
            artistId: command.artistId,
            confirmedSecondBooking: command.confirmedSecondBooking,
            date: command.date,
            durationMinutes: command.durationMinutes,
            hostId: original.hostId,
            idempotencyKey,
            startMinute: command.startMinute,
          },
          {
            appointmentId: replacementId,
            auditAction: 'APPOINTMENT_CREATED_BY_RESCHEDULE',
            eventType: 'APPOINTMENT_RESCHEDULED_TO',
            ...(original.fixedRuleId ? { excludeFixedRuleId: original.fixedRuleId } : {}),
            ...(reason ? { reason } : {}),
            rescheduledFromAppointmentId: original.id,
          },
        );
        const originalSummary: BookingCancellationResult = {
          cancelledAt: now.toISOString(),
          id: original.id,
          rowVersion: command.expectedRowVersion + 1,
          status: 'CANCELLED',
        };
        await this.audit.append(transaction, context, {
          action: 'APPOINTMENT_RESCHEDULE_SOURCE_CANCELLED',
          afterData: { ...originalSummary, replacementAppointmentId: appointment.id },
          beforeData: { rowVersion: original.rowVersion, status: original.status },
          objectId: original.id,
          objectType: 'APPOINTMENT',
          ...(reason ? { reason } : {}),
          siteId: original.siteId,
        });
        await transaction.outboxEvent.create({
          data: {
            aggregateId: original.id,
            aggregateType: 'APPOINTMENT',
            eventType: 'APPOINTMENT_RESCHEDULED_FROM',
            payload: {
              appointmentId: original.id,
              artistId: original.artistId,
              hostId: original.hostId,
              replacementAppointmentId: appointment.id,
              siteId: original.siteId,
            },
          },
        });
        await this.creator.completeIdempotency(
          transaction,
          context.userId,
          IDEMPOTENCY_SCOPE,
          idempotencyKey,
          appointment.id,
        );
        return { appointment, original: originalSummary, replayed: false };
      })
      .catch((error: unknown) => {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          (error.code === 'P2002' || error.code === 'P2004')
        ) {
          throw new BookingSlotConflictError();
        }
        throw error;
      });
  }

  private original(transaction: Prisma.TransactionClient, appointmentId: string) {
    return transaction.appointment
      .findUnique({ select: ORIGINAL_SELECT, where: { id: appointmentId } })
      .then((appointment) => {
        if (!appointment) throw new BookingAppointmentNotFoundError();
        return appointment;
      });
  }

  private async lock(
    transaction: Prisma.TransactionClient,
    userId: string,
    original: OriginalAppointment,
    command: RescheduleBookingCommand,
    idempotencyKey: string,
  ): Promise<void> {
    const oldDate = formatDateOnly(original.appointmentDate);
    const newDate = formatDateOnly(command.date);
    const keys = [
      `appointment:artist:${command.artistId}:${newDate}`,
      `appointment:artist:${original.artistId}:${oldDate}`,
      `appointment:host:${original.hostId}:${newDate}`,
      `appointment:host:${original.hostId}:${oldDate}`,
      `appointment:reschedule:${original.id}`,
      `idempotency:${userId}:${IDEMPOTENCY_SCOPE}:${idempotencyKey}`,
    ];
    const weekday = isoWeekdayForDate(command.date);
    for (
      let minute = command.startMinute;
      minute < command.startMinute + command.durationMinutes;
      minute += 15
    ) {
      keys.push(`fixed:artist:${command.artistId}:${weekday}:${minute}`);
      keys.push(`fixed:host:${original.hostId}:${weekday}:${minute}`);
    }
    for (const key of [...new Set(keys)].sort()) await acquireTransactionLock(transaction, key);
  }

  private requestHash(command: RescheduleBookingCommand, reason: string | undefined): string {
    return createHash('sha256')
      .update(
        JSON.stringify({
          appointmentId: command.appointmentId,
          artistId: command.artistId,
          confirmedSecondBooking: command.confirmedSecondBooking,
          date: formatDateOnly(command.date),
          durationMinutes: command.durationMinutes,
          expectedRowVersion: command.expectedRowVersion,
          reason: reason ?? null,
          startMinute: command.startMinute,
        }),
      )
      .digest('hex');
  }

  private reason(context: BookingCommandContext, value: string | undefined): string | undefined {
    const result = value?.normalize('NFKC').trim();
    if (
      (result && result.length > 500) ||
      (['CUSTOMER_SERVICE', 'ADMIN'].includes(context.roleCode) && !result)
    ) {
      throw new BookingCancellationReasonInvalidError();
    }
    return result || undefined;
  }

  private async assertActorScope(
    transaction: Prisma.TransactionClient,
    context: BookingCommandContext,
    original: OriginalAppointment,
  ): Promise<void> {
    switch (context.roleCode) {
      case 'HOST':
        if (original.host.userId !== context.userId) throw new AuthorizationDeniedError();
        return;
      case 'OPERATOR': {
        const relation = await transaction.hostOperatorRelation.findFirst({
          select: { id: true },
          where: {
            hostId: original.hostId,
            operator: {
              employmentStatus: 'ACTIVE',
              siteId: original.siteId,
              userId: context.userId,
            },
            validFrom: { lte: original.appointmentDate },
            OR: [{ validUntil: null }, { validUntil: { gt: original.appointmentDate } }],
          },
        });
        if (!relation) throw new AuthorizationDeniedError();
        return;
      }
      case 'CUSTOMER_SERVICE':
        this.authorization.assertSiteScope(context, original.siteId);
        return;
      case 'ADMIN':
        return;
      case 'ARTIST':
        throw new AuthorizationDeniedError();
    }
  }

  private cancelledSummary(original: OriginalAppointment): BookingCancellationResult {
    if (original.status !== 'CANCELLED' || !original.cancelledAt) {
      throw new BookingStateConflictError();
    }
    return {
      cancelledAt: original.cancelledAt.toISOString(),
      id: original.id,
      rowVersion: original.rowVersion,
      status: 'CANCELLED',
    };
  }
}
