import { Prisma } from '@makeup/database';
import { Injectable } from '@nestjs/common';

import { AuditCommandService } from '../audit/audit-command.service';
import {
  AuthorizationDeniedError,
  AuthorizationPolicyService,
} from '../auth/authorization-policy.service';
import { DatabaseService } from '../database/database.service';
import { toBusinessDate } from '../shift/business-date';
import {
  BookingAppointmentNotFoundError,
  BookingCancellationCutoffError,
  BookingCancellationReasonInvalidError,
  BookingStateConflictError,
} from './booking-create.errors';
import type {
  BookingCancellationResult,
  BookingCommandContext,
  CancelBookingCommand,
} from './booking-create.types';

const CANCELLATION_SELECT = {
  appointmentDate: true,
  artistId: true,
  host: { select: { userId: true } },
  hostId: true,
  id: true,
  rowVersion: true,
  siteId: true,
  status: true,
} satisfies Prisma.AppointmentSelect;

type CancellationRecord = Prisma.AppointmentGetPayload<{ select: typeof CANCELLATION_SELECT }>;

@Injectable()
export class BookingCancelService {
  constructor(
    private readonly audit: AuditCommandService,
    private readonly authorization: AuthorizationPolicyService,
    private readonly database: DatabaseService,
  ) {}

  cancel(
    context: BookingCommandContext,
    command: CancelBookingCommand,
    now = new Date(),
  ): Promise<BookingCancellationResult> {
    this.authorization.assertRole(context, ['HOST', 'OPERATOR', 'CUSTOMER_SERVICE', 'ADMIN']);
    const reason = this.reason(context, command.reason);
    return this.database.transaction(async (transaction) => {
      const appointment = await transaction.appointment.findUnique({
        select: CANCELLATION_SELECT,
        where: { id: command.appointmentId },
      });
      if (!appointment) throw new BookingAppointmentNotFoundError();
      await this.assertActorScope(transaction, context, appointment);
      if (
        (context.roleCode === 'HOST' || context.roleCode === 'OPERATOR') &&
        appointment.appointmentDate <= toBusinessDate(now)
      ) {
        throw new BookingCancellationCutoffError();
      }
      if (
        appointment.status !== 'BOOKED' ||
        appointment.rowVersion !== command.expectedRowVersion
      ) {
        throw new BookingStateConflictError();
      }

      const updated = await transaction.appointment.updateMany({
        data: {
          cancellationReasonCode: ['CUSTOMER_SERVICE', 'ADMIN'].includes(context.roleCode)
            ? 'BACKOFFICE_CANCELLED'
            : 'USER_CANCELLED',
          cancellationReasonText: reason ?? null,
          cancelledAt: now,
          cancelledByUserId: context.userId,
          rowVersion: { increment: 1 },
          status: 'CANCELLED',
        },
        where: {
          id: appointment.id,
          rowVersion: command.expectedRowVersion,
          status: 'BOOKED',
        },
      });
      if (updated.count !== 1) throw new BookingStateConflictError();

      const result: BookingCancellationResult = {
        cancelledAt: now.toISOString(),
        id: appointment.id,
        rowVersion: command.expectedRowVersion + 1,
        status: 'CANCELLED',
      };
      await this.audit.append(transaction, context, {
        action: 'APPOINTMENT_CANCELLED',
        afterData: { ...result },
        beforeData: { rowVersion: appointment.rowVersion, status: appointment.status },
        objectId: appointment.id,
        objectType: 'APPOINTMENT',
        ...(reason ? { reason } : {}),
        siteId: appointment.siteId,
      });
      await transaction.outboxEvent.create({
        data: {
          aggregateId: appointment.id,
          aggregateType: 'APPOINTMENT',
          eventType: 'APPOINTMENT_CANCELLED',
          payload: {
            appointmentId: appointment.id,
            artistId: appointment.artistId,
            hostId: appointment.hostId,
            siteId: appointment.siteId,
          },
        },
      });
      return result;
    });
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
    appointment: CancellationRecord,
  ): Promise<void> {
    switch (context.roleCode) {
      case 'HOST':
        if (appointment.host.userId !== context.userId) throw new AuthorizationDeniedError();
        return;
      case 'OPERATOR': {
        const relation = await transaction.hostOperatorRelation.findFirst({
          select: { id: true },
          where: {
            hostId: appointment.hostId,
            operator: {
              employmentStatus: 'ACTIVE',
              siteId: appointment.siteId,
              userId: context.userId,
            },
            validFrom: { lte: appointment.appointmentDate },
            OR: [{ validUntil: null }, { validUntil: { gt: appointment.appointmentDate } }],
          },
        });
        if (!relation) throw new AuthorizationDeniedError();
        return;
      }
      case 'CUSTOMER_SERVICE':
        this.authorization.assertSiteScope(context, appointment.siteId);
        return;
      case 'ADMIN':
        return;
      case 'ARTIST':
        throw new AuthorizationDeniedError();
    }
  }
}
