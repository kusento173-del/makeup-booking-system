import { Prisma } from '@makeup/database';
import { Injectable } from '@nestjs/common';

import { AuthorizationDeniedError } from '../auth/authorization-policy.service';
import type { VerifiedAuthorizationContext } from '../auth/authorization.types';
import { DatabaseService } from '../database/database.service';
import { formatDateOnly } from '../shift/business-date';
import { BookingStateConflictError } from './booking-create.errors';
import type {
  AppointmentDisplayStatus,
  AppointmentListInput,
  AppointmentListItem,
  AppointmentPage,
} from './appointment-query.types';

const LIST_SELECT = {
  appointmentDate: true,
  appointmentType: true,
  artistId: true,
  artistNicknameSnapshot: true,
  dailySequence: true,
  durationMinutes: true,
  endAt: true,
  hostCodeSnapshot: true,
  hostId: true,
  hostNameSnapshot: true,
  id: true,
  operatorIdAtBooking: true,
  operatorNameSnapshot: true,
  rescheduledFromAppointmentId: true,
  rowVersion: true,
  siteId: true,
  siteNameSnapshot: true,
  startAt: true,
  status: true,
} satisfies Prisma.AppointmentSelect;

type ListRecord = Prisma.AppointmentGetPayload<{ select: typeof LIST_SELECT }>;

@Injectable()
export class AppointmentQueryService {
  constructor(private readonly database: DatabaseService) {}

  list(
    context: VerifiedAuthorizationContext,
    input: AppointmentListInput,
    now = new Date(),
  ): Promise<AppointmentPage> {
    return this.database.read(async (client) => {
      const scope = await this.scope(client, context, input);
      const where: Prisma.AppointmentWhereInput = {
        AND: [
          { appointmentDate: { gte: input.fromDate, lte: input.toDate } },
          scope,
          this.status(input.status, now),
        ],
      };
      const [items, total] = await Promise.all([
        client.appointment.findMany({
          orderBy: [{ appointmentDate: 'asc' }, { startAt: 'asc' }, { artistId: 'asc' }],
          select: LIST_SELECT,
          skip: (input.page - 1) * input.pageSize,
          take: input.pageSize,
          where,
        }),
        client.appointment.count({ where }),
      ]);
      return {
        items: items.map((item) => this.item(item, now)),
        page: input.page,
        pageSize: input.pageSize,
        total,
      };
    });
  }

  private async scope(
    client: Parameters<Parameters<DatabaseService['read']>[0]>[0],
    context: VerifiedAuthorizationContext,
    input: AppointmentListInput,
  ): Promise<Prisma.AppointmentWhereInput> {
    switch (context.roleCode) {
      case 'HOST':
        return { host: { userId: context.userId } };
      case 'ARTIST':
        return { artist: { userId: context.userId } };
      case 'CUSTOMER_SERVICE':
        if (!context.siteId) throw new AuthorizationDeniedError();
        return { siteId: context.siteId };
      case 'ADMIN':
        return {};
      case 'OPERATOR': {
        const relations = await client.hostOperatorRelation.findMany({
          select: { hostId: true, validFrom: true, validUntil: true },
          where: {
            operator: { employmentStatus: 'ACTIVE', userId: context.userId },
            validFrom: { lte: input.toDate },
            OR: [{ validUntil: null }, { validUntil: { gt: input.fromDate } }],
          },
        });
        return {
          OR: relations.map((relation) => ({
            appointmentDate: {
              gte: relation.validFrom > input.fromDate ? relation.validFrom : input.fromDate,
              lte: this.inclusiveEnd(relation.validUntil, input.toDate),
            },
            hostId: relation.hostId,
          })),
        };
      }
    }
  }

  private inclusiveEnd(validUntil: Date | null, requestedEnd: Date): Date {
    if (!validUntil) return requestedEnd;
    const end = new Date(validUntil);
    end.setUTCDate(end.getUTCDate() - 1);
    return end < requestedEnd ? end : requestedEnd;
  }

  private status(
    status: AppointmentDisplayStatus | undefined,
    now: Date,
  ): Prisma.AppointmentWhereInput {
    switch (status) {
      case 'BOOKED':
        return { endAt: { gt: now }, status: 'BOOKED' };
      case 'COMPLETED':
        return { OR: [{ status: 'COMPLETED' }, { endAt: { lte: now }, status: 'BOOKED' }] };
      case 'CANCELLED':
        return { status: 'CANCELLED' };
      case undefined:
        return {};
    }
  }

  private item(appointment: ListRecord, now: Date): AppointmentListItem {
    if (
      appointment.appointmentType !== 'SINGLE' ||
      (appointment.status !== 'BOOKED' &&
        appointment.status !== 'CANCELLED' &&
        appointment.status !== 'COMPLETED') ||
      (appointment.dailySequence !== 1 && appointment.dailySequence !== 2)
    ) {
      throw new BookingStateConflictError();
    }
    return {
      appointmentType: 'SINGLE',
      artistId: appointment.artistId,
      artistNickname: appointment.artistNicknameSnapshot,
      dailySequence: appointment.dailySequence,
      date: formatDateOnly(appointment.appointmentDate),
      durationMinutes: appointment.durationMinutes,
      endAt: appointment.endAt.toISOString(),
      hostCode: appointment.hostCodeSnapshot,
      hostId: appointment.hostId,
      hostName: appointment.hostNameSnapshot,
      id: appointment.id,
      operatorId: appointment.operatorIdAtBooking,
      operatorName: appointment.operatorNameSnapshot,
      rescheduledFromAppointmentId: appointment.rescheduledFromAppointmentId,
      rowVersion: appointment.rowVersion,
      siteId: appointment.siteId,
      siteName: appointment.siteNameSnapshot,
      startAt: appointment.startAt.toISOString(),
      status:
        appointment.status === 'BOOKED' && appointment.endAt <= now
          ? 'COMPLETED'
          : appointment.status,
    };
  }
}
