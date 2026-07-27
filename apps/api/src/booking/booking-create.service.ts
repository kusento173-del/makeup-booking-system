import { createHash } from 'node:crypto';

import { Prisma } from '@makeup/database';
import { Injectable } from '@nestjs/common';

import { ArtistAvailabilityService } from '../availability/artist-availability.service';
import { AuditCommandService } from '../audit/audit-command.service';
import {
  AuthorizationDeniedError,
  AuthorizationPolicyService,
} from '../auth/authorization-policy.service';
import { DatabaseService } from '../database/database.service';
import { isHostQualifiedOn } from '../master-data/host-qualification';
import { acquireTransactionLock } from '../database/transaction-lock';
import {
  businessDateMinuteToInstant,
  formatDateOnly,
  isoWeekdayForDate,
} from '../shift/business-date';
import {
  BookingArtistUnavailableError,
  BookingCreationReasonInvalidError,
  BookingDailyLimitReachedError,
  BookingHostUnavailableError,
  BookingIdempotencyConflictError,
  BookingIdempotencyIncompleteError,
  BookingIdempotencyKeyInvalidError,
  BookingSecondConfirmationRequiredError,
  BookingSlotConflictError,
  BookingStateConflictError,
} from './booking-create.errors';
import type {
  AppointmentSummary,
  BookingCommandContext,
  BookingCreateResult,
  CreateBookingCommand,
} from './booking-create.types';
import { BookingHostNotFoundError, BookingSiteMismatchError } from './booking-slot.errors';
import { validateBookingDate, validateBookingStart } from './booking-time';

const IDEMPOTENCY_SCOPE = 'APPOINTMENT_CREATE';
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const ACTIVE_STATUSES = ['BOOKED', 'COMPLETED'] as const;

const APPOINTMENT_SELECT = {
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
  rowVersion: true,
  siteId: true,
  siteNameSnapshot: true,
  startAt: true,
  status: true,
} satisfies Prisma.AppointmentSelect;

const HOST_SELECT = {
  hostCode: true,
  id: true,
  leaveRecords: {
    select: { id: true },
    take: 1,
    where: { status: 'ACTIVE' },
  },
  nickname: true,
  operatorRelations: {
    orderBy: { validFrom: 'desc' as const },
    select: {
      operator: {
        select: {
          employmentStatus: true,
          id: true,
          realName: true,
          siteId: true,
          userId: true,
        },
      },
    },
    take: 1,
  },
  qualificationStatus: true,
  qualificationValidUntil: true,
  realName: true,
  site: { select: { name: true, status: true } },
  siteId: true,
  userId: true,
} satisfies Prisma.HostProfileSelect;

type AppointmentRecord = Prisma.AppointmentGetPayload<{ select: typeof APPOINTMENT_SELECT }>;
type HostRecord = Prisma.HostProfileGetPayload<{ select: typeof HOST_SELECT }>;

export interface BookingCreationOptions {
  readonly appointmentId?: string;
  readonly auditAction?: string;
  readonly excludeFixedRuleId?: string;
  readonly reason?: string;
  readonly rescheduledFromAppointmentId?: string;
}

@Injectable()
export class BookingCreateService {
  constructor(
    private readonly audit: AuditCommandService,
    private readonly availability: ArtistAvailabilityService,
    private readonly authorization: AuthorizationPolicyService,
    private readonly database: DatabaseService,
  ) {}

  create(
    context: BookingCommandContext,
    command: CreateBookingCommand,
    now = new Date(),
  ): Promise<BookingCreateResult> {
    this.authorization.assertRole(context, ['HOST', 'OPERATOR', 'CUSTOMER_SERVICE', 'ADMIN']);
    validateBookingDate(command.date, now);
    validateBookingStart(command.startMinute, command.durationMinutes);
    const idempotencyKey = this.normalizeIdempotencyKey(command.idempotencyKey);
    const reason = this.creationReason(context, command.reason);
    const normalizedCommand: CreateBookingCommand = {
      artistId: command.artistId,
      confirmedSecondBooking: command.confirmedSecondBooking,
      date: command.date,
      durationMinutes: command.durationMinutes,
      hostId: command.hostId,
      idempotencyKey: command.idempotencyKey,
      ...(reason ? { reason } : {}),
      startMinute: command.startMinute,
    };
    const requestHash = this.requestHash(normalizedCommand);

    return this.database
      .transaction(async (transaction) => {
        await this.lock(transaction, context.userId, command, idempotencyKey);
        const replay = await this.prepareIdempotency(
          transaction,
          context.userId,
          IDEMPOTENCY_SCOPE,
          idempotencyKey,
          requestHash,
          now,
        );
        if (replay) return { appointment: replay, replayed: true };
        const summary = await this.createFresh(transaction, context, normalizedCommand, {
          ...(reason ? { reason } : {}),
        });
        await this.completeIdempotency(
          transaction,
          context.userId,
          IDEMPOTENCY_SCOPE,
          idempotencyKey,
          summary.id,
        );
        return { appointment: summary, replayed: false };
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

  async createFresh(
    transaction: Prisma.TransactionClient,
    context: BookingCommandContext,
    command: CreateBookingCommand,
    options: BookingCreationOptions = {},
  ): Promise<AppointmentSummary> {
    const host = await this.host(transaction, command);
    this.assertActorScope(context, host);
    this.assertHostAvailable(host, command.date);

    const artist = await this.availability.getDayWithClient(
      transaction,
      command.artistId,
      command.date,
    );
    if (host.siteId !== artist.siteId) throw new BookingSiteMismatchError();
    if (!artist.available) throw new BookingArtistUnavailableError(artist.reason);
    if (!this.intervalFits(artist.intervals, command.startMinute, command.durationMinutes)) {
      throw new BookingSlotConflictError();
    }

    const startAt = businessDateMinuteToInstant(command.date, command.startMinute);
    const endAt = new Date(startAt.getTime() + command.durationMinutes * 60_000);
    const weekday = isoWeekdayForDate(command.date);
    const endMinute = command.startMinute + command.durationMinutes;
    const [active, fixedOccupation, pendingOccupations] = await Promise.all([
      transaction.appointment.findMany({
        orderBy: { dailySequence: 'asc' },
        select: {
          artistId: true,
          dailySequence: true,
          endAt: true,
          hostId: true,
          startAt: true,
        },
        where: {
          appointmentDate: command.date,
          OR: [{ artistId: command.artistId }, { hostId: command.hostId }],
          status: { in: [...ACTIVE_STATUSES] },
        },
      }),
      transaction.fixedAppointmentRuleWeekday.findFirst({
        select: { ruleId: true },
        where: {
          endMinute: { gt: command.startMinute },
          ...(options.excludeFixedRuleId ? { ruleId: { not: options.excludeFixedRuleId } } : {}),
          isoWeekday: weekday,
          OR: [{ artistId: command.artistId }, { hostId: command.hostId }],
          rule: {
            appointments: {
              none: { appointmentDate: command.date, status: 'CANCELLED' },
            },
          },
          startMinute: { lt: endMinute },
          validFrom: { lte: command.date },
          AND: [{ OR: [{ validUntil: null }, { validUntil: { gt: command.date } }] }],
        },
      }),
      transaction.fixedAppointmentRequest.findMany({
        select: { targetDurationMinutes: true, targetStartMinute: true },
        where: {
          effectiveFrom: { lte: command.date },
          OR: [{ targetArtistId: command.artistId }, { hostId: command.hostId }],
          status: 'PENDING',
          targetWeekdays: { has: weekday },
        },
      }),
    ]);
    if (
      fixedOccupation ||
      pendingOccupations.some((request) => {
        const pendingStart = request.targetStartMinute;
        const pendingDuration = request.targetDurationMinutes;
        return (
          pendingStart !== null &&
          pendingDuration !== null &&
          command.startMinute < pendingStart + pendingDuration &&
          pendingStart < endMinute
        );
      })
    ) {
      throw new BookingSlotConflictError();
    }
    if (active.some((item) => startAt < item.endAt && item.startAt < endAt)) {
      throw new BookingSlotConflictError();
    }
    const hostAppointments = active.filter((item) => item.hostId === command.hostId);
    if (hostAppointments.length >= 2) throw new BookingDailyLimitReachedError();
    if (hostAppointments.length === 1 && !command.confirmedSecondBooking) {
      throw new BookingSecondConfirmationRequiredError();
    }
    const dailySequence = hostAppointments.some((item) => item.dailySequence === 1) ? 2 : 1;
    const operator = host.operatorRelations[0]?.operator ?? null;
    if (operator && (operator.siteId !== host.siteId || operator.employmentStatus !== 'ACTIVE')) {
      throw new BookingStateConflictError();
    }

    const appointment = await transaction.appointment.create({
      data: {
        ...(options.appointmentId ? { id: options.appointmentId } : {}),
        appointmentDate: command.date,
        artistId: command.artistId,
        artistNicknameSnapshot: artist.artistNickname,
        createdByRole: context.roleCode,
        createdByUserId: context.userId,
        dailySequence,
        durationMinutes: command.durationMinutes,
        endAt,
        hostCodeSnapshot: host.hostCode,
        hostId: host.id,
        hostNameSnapshot: host.nickname ?? host.realName,
        operatorIdAtBooking: operator?.id ?? null,
        operatorNameSnapshot: operator?.realName ?? null,
        ...(options.rescheduledFromAppointmentId
          ? { rescheduledFromAppointmentId: options.rescheduledFromAppointmentId }
          : {}),
        siteId: host.siteId,
        siteNameSnapshot: host.site.name,
        startAt,
      },
      select: APPOINTMENT_SELECT,
    });
    const summary = this.toSummary(appointment);
    await this.recordSideEffects(transaction, context, summary, options);
    return summary;
  }

  normalizeIdempotencyKey(value: string): string {
    const normalized = value.normalize('NFKC').trim();
    if (!IDEMPOTENCY_KEY_PATTERN.test(normalized)) {
      throw new BookingIdempotencyKeyInvalidError();
    }
    return normalized;
  }

  requestHash(command: CreateBookingCommand): string {
    return createHash('sha256')
      .update(
        JSON.stringify({
          artistId: command.artistId,
          confirmedSecondBooking: command.confirmedSecondBooking,
          date: formatDateOnly(command.date),
          durationMinutes: command.durationMinutes,
          hostId: command.hostId,
          ...(command.reason ? { reason: command.reason } : {}),
          startMinute: command.startMinute,
        }),
      )
      .digest('hex');
  }

  private async lock(
    transaction: Prisma.TransactionClient,
    userId: string,
    command: CreateBookingCommand,
    idempotencyKey: string,
  ): Promise<void> {
    const date = formatDateOnly(command.date);
    const keys = [
      `appointment:artist:${command.artistId}:${date}`,
      `appointment:host:${command.hostId}:${date}`,
      `idempotency:${userId}:${IDEMPOTENCY_SCOPE}:${idempotencyKey}`,
    ];
    const weekday = isoWeekdayForDate(command.date);
    for (
      let minute = command.startMinute;
      minute < command.startMinute + command.durationMinutes;
      minute += 15
    ) {
      keys.push(`fixed:artist:${command.artistId}:${weekday}:${minute}`);
      keys.push(`fixed:host:${command.hostId}:${weekday}:${minute}`);
    }
    for (const key of keys.sort()) await acquireTransactionLock(transaction, key);
  }

  async prepareIdempotency(
    transaction: Prisma.TransactionClient,
    userId: string,
    scope: string,
    idempotencyKey: string,
    requestHash: string,
    now: Date,
  ): Promise<AppointmentSummary | null> {
    const where = {
      userId_scope_idempotencyKey: { idempotencyKey, scope, userId },
    };
    const existing = await transaction.idempotencyRecord.findUnique({ where });
    if (existing && existing.expiresAt <= now) {
      await transaction.idempotencyRecord.delete({ where });
    } else if (existing) {
      if (existing.requestHash !== requestHash) throw new BookingIdempotencyConflictError();
      if (existing.resourceType !== 'APPOINTMENT' || !existing.resourceId) {
        throw new BookingIdempotencyIncompleteError();
      }
      const appointment = await transaction.appointment.findUnique({
        select: APPOINTMENT_SELECT,
        where: { id: existing.resourceId },
      });
      if (!appointment) throw new BookingIdempotencyIncompleteError();
      return this.toSummary(appointment);
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

  private host(transaction: Prisma.TransactionClient, command: CreateBookingCommand) {
    return transaction.hostProfile
      .findUnique({
        select: {
          ...HOST_SELECT,
          leaveRecords: {
            ...HOST_SELECT.leaveRecords,
            where: {
              endDate: { gte: command.date },
              startDate: { lte: command.date },
              status: 'ACTIVE',
            },
          },
          operatorRelations: {
            ...HOST_SELECT.operatorRelations,
            where: {
              validFrom: { lte: command.date },
              OR: [{ validUntil: null }, { validUntil: { gt: command.date } }],
            },
          },
        },
        where: { id: command.hostId },
      })
      .then((host) => {
        if (!host) throw new BookingHostNotFoundError();
        return host;
      });
  }

  private assertActorScope(context: BookingCommandContext, host: HostRecord): void {
    const operator = host.operatorRelations[0]?.operator;
    switch (context.roleCode) {
      case 'HOST':
        if (host.userId !== context.userId) throw new AuthorizationDeniedError();
        return;
      case 'OPERATOR':
        if (operator?.userId !== context.userId) throw new AuthorizationDeniedError();
        return;
      case 'CUSTOMER_SERVICE':
        this.authorization.assertSiteScope(context, host.siteId);
        return;
      case 'ADMIN':
        return;
      case 'ARTIST':
        throw new AuthorizationDeniedError();
    }
  }

  private assertHostAvailable(host: HostRecord, date: Date): void {
    if (
      !isHostQualifiedOn(host, date) ||
      host.site.status !== 'ACTIVE' ||
      host.leaveRecords.length > 0
    ) {
      throw new BookingHostUnavailableError();
    }
  }

  private intervalFits(
    intervals: readonly { readonly endMinute: number; readonly startMinute: number }[],
    startMinute: number,
    durationMinutes: number,
  ): boolean {
    const endMinute = startMinute + durationMinutes;
    return intervals.some(
      (interval) => interval.startMinute <= startMinute && endMinute <= interval.endMinute,
    );
  }

  private async recordSideEffects(
    transaction: Prisma.TransactionClient,
    context: BookingCommandContext,
    appointment: AppointmentSummary,
    options: BookingCreationOptions,
  ): Promise<void> {
    await this.audit.append(transaction, context, {
      action: options.auditAction ?? 'APPOINTMENT_CREATED',
      afterData: {
        appointmentType: appointment.appointmentType,
        artistId: appointment.artistId,
        dailySequence: appointment.dailySequence,
        date: appointment.date,
        durationMinutes: appointment.durationMinutes,
        endAt: appointment.endAt,
        hostId: appointment.hostId,
        startAt: appointment.startAt,
        status: appointment.status,
      },
      objectId: appointment.id,
      objectType: 'APPOINTMENT',
      ...(options.reason ? { reason: options.reason } : {}),
      siteId: appointment.siteId,
    });
  }

  private creationReason(
    context: BookingCommandContext,
    value: string | undefined,
  ): string | undefined {
    const result = value?.normalize('NFKC').trim();
    if (
      (result && result.length > 500) ||
      (['CUSTOMER_SERVICE', 'ADMIN'].includes(context.roleCode) && !result)
    ) {
      throw new BookingCreationReasonInvalidError();
    }
    return result || undefined;
  }

  async completeIdempotency(
    transaction: Prisma.TransactionClient,
    userId: string,
    scope: string,
    idempotencyKey: string,
    appointmentId: string,
  ): Promise<void> {
    const updated = await transaction.idempotencyRecord.updateMany({
      data: {
        resourceId: appointmentId,
        resourceType: 'APPOINTMENT',
        responseBody: { appointmentId },
        responseStatus: 201,
      },
      where: {
        idempotencyKey,
        resourceId: null,
        scope,
        userId,
      },
    });
    if (updated.count !== 1) throw new BookingStateConflictError();
  }

  private toSummary(appointment: AppointmentRecord): AppointmentSummary {
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
      rowVersion: appointment.rowVersion,
      siteId: appointment.siteId,
      siteName: appointment.siteNameSnapshot,
      startAt: appointment.startAt.toISOString(),
      status: appointment.status,
    };
  }
}
