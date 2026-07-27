import { Prisma, type DatabaseClient } from '@makeup/database';
import { Injectable } from '@nestjs/common';

import { AuditCommandService } from '../audit/audit-command.service';
import { AuthorizationDeniedError } from '../auth/authorization-policy.service';
import { DatabaseService } from '../database/database.service';
import { isHostQualifiedOn } from '../master-data/host-qualification';
import { acquireTransactionLock } from '../database/transaction-lock';
import { formatDateOnly, isoWeekdayForDate, toBusinessDate } from '../shift/business-date';
import {
  LeaveDateRangeInvalidError,
  LeaveFixedAppointmentRestoreConflictError,
  LeaveImpactChangedError,
  LeaveNotFoundError,
  LeaveReasonInvalidError,
  LeaveStateConflictError,
  LeaveSubjectUnavailableError,
} from './leave.errors';
import type {
  CancelLeaveCommand,
  CreateLeaveCommand,
  LeaveCommandContext,
  LeaveDateRange,
  LeaveImpactPreview,
  LeaveSummary,
} from './leave.types';

interface LeaveSubject {
  readonly id: string;
  readonly siteId: string;
  readonly subjectType: 'ARTIST' | 'HOST';
}

const RESTORABLE_FIXED_APPOINTMENT_SELECT = {
  appointmentDate: true,
  artistId: true,
  dailySequence: true,
  endAt: true,
  fixedRule: {
    select: {
      durationMinutes: true,
      startMinute: true,
      status: true,
      validFrom: true,
      validUntil: true,
      weekdays: { select: { isoWeekday: true } },
    },
  },
  hostId: true,
  id: true,
  rowVersion: true,
  siteId: true,
  startAt: true,
} satisfies Prisma.AppointmentSelect;

type RestorableFixedAppointment = Prisma.AppointmentGetPayload<{
  select: typeof RESTORABLE_FIXED_APPOINTMENT_SELECT;
}>;

function optionalReason(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const result = value.normalize('NFKC').trim();
  if (!result || result.length > 500) throw new LeaveReasonInvalidError();
  return result;
}

function assertDateOnly(date: Date): void {
  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCHours() !== 0 ||
    date.getUTCMinutes() !== 0 ||
    date.getUTCSeconds() !== 0 ||
    date.getUTCMilliseconds() !== 0
  ) {
    throw new LeaveDateRangeInvalidError();
  }
}

function validateRange(range: LeaveDateRange, now: Date): void {
  assertDateOnly(range.startDate);
  assertDateOnly(range.endDate);
  const today = toBusinessDate(now);
  const tomorrow = new Date(today);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const lastDate = new Date(today);
  lastDate.setUTCDate(lastDate.getUTCDate() + 7);
  const duration = (range.endDate.getTime() - range.startDate.getTime()) / 86_400_000;
  if (range.startDate < tomorrow || range.endDate > lastDate || duration < 0 || duration > 6) {
    throw new LeaveDateRangeInvalidError();
  }
}

@Injectable()
export class LeaveService {
  constructor(
    private readonly audit: AuditCommandService,
    private readonly database: DatabaseService,
  ) {}

  preview(
    context: LeaveCommandContext,
    range: LeaveDateRange,
    now = new Date(),
  ): Promise<LeaveImpactPreview> {
    validateRange(range, now);
    return this.database.read(async (client) => {
      const subject = await this.resolveSelf(client, context);
      return this.toPreview(subject, range, await this.appointmentCount(client, subject, range));
    });
  }

  listSelf(context: LeaveCommandContext, now = new Date()): Promise<readonly LeaveSummary[]> {
    return this.database.read(async (client) => {
      const subject = await this.resolveSelf(client, context);
      const leaves = await client.leaveRecord.findMany({
        orderBy: [{ startDate: 'asc' }, { createdAt: 'desc' }],
        select: {
          affectedAppointmentCount: true,
          artistId: true,
          endDate: true,
          hostId: true,
          id: true,
          reason: true,
          rowVersion: true,
          startDate: true,
          status: true,
          subjectType: true,
        },
        where: {
          endDate: { gte: toBusinessDate(now) },
          status: 'ACTIVE',
          ...(subject.subjectType === 'ARTIST' ? { artistId: subject.id } : { hostId: subject.id }),
        },
      });
      return leaves.map((leave) => this.toSummary(leave));
    });
  }

  create(
    context: LeaveCommandContext,
    command: CreateLeaveCommand,
    now = new Date(),
  ): Promise<LeaveSummary> {
    validateRange(command, now);
    const reason = optionalReason(command.reason);
    return this.database.transaction(async (transaction) => {
      const subject = await this.resolveSelf(transaction, context);
      await this.lockSchedule(transaction, subject, command);
      const affectedAppointmentCount = await this.appointmentCount(transaction, subject, command);
      if (command.confirmedAffectedAppointmentCount !== affectedAppointmentCount) {
        throw new LeaveImpactChangedError();
      }
      const leave = await transaction.leaveRecord.create({
        data: {
          affectedAppointmentCount,
          artistId: subject.subjectType === 'ARTIST' ? subject.id : null,
          createdByUserId: context.userId,
          endDate: command.endDate,
          hostId: subject.subjectType === 'HOST' ? subject.id : null,
          reason: reason ?? null,
          startDate: command.startDate,
          subjectType: subject.subjectType,
        },
        select: {
          affectedAppointmentCount: true,
          artistId: true,
          endDate: true,
          hostId: true,
          id: true,
          reason: true,
          rowVersion: true,
          startDate: true,
          status: true,
          subjectType: true,
        },
      });
      const summary = this.toSummary(leave);
      const cancelled = await transaction.appointment.updateMany({
        data: {
          cancellationReasonCode: subject.subjectType === 'ARTIST' ? 'ARTIST_LEAVE' : 'HOST_LEAVE',
          cancellationReasonText: reason ?? null,
          cancellationSourceId: leave.id,
          cancellationSourceType: 'LEAVE_RECORD',
          cancelledAt: now,
          cancelledByUserId: context.userId,
          rowVersion: { increment: 1 },
          status: 'CANCELLED',
        },
        where: this.appointmentWhere(subject, command),
      });
      if (cancelled.count !== affectedAppointmentCount) throw new LeaveImpactChangedError();
      await this.audit.append(transaction, context, {
        action: 'LEAVE_CREATED',
        afterData: { ...summary },
        objectId: leave.id,
        objectType: 'LEAVE_RECORD',
        ...(reason ? { reason } : {}),
        siteId: subject.siteId,
      });
      return summary;
    });
  }

  cancel(
    context: LeaveCommandContext,
    command: CancelLeaveCommand,
    now = new Date(),
  ): Promise<void> {
    const reason = optionalReason(command.reason);
    if (context.roleCode === 'ADMIN' && !reason) throw new LeaveReasonInvalidError();
    if (!['HOST', 'ARTIST', 'ADMIN'].includes(context.roleCode))
      throw new AuthorizationDeniedError();

    return this.database.transaction(async (transaction) => {
      const leave = await transaction.leaveRecord.findUnique({
        select: {
          artist: { select: { siteId: true, userId: true } },
          host: { select: { siteId: true, userId: true } },
          id: true,
          rowVersion: true,
          startDate: true,
          status: true,
        },
        where: { id: command.leaveId },
      });
      if (!leave) throw new LeaveNotFoundError();
      const subject = leave.host ?? leave.artist;
      if (!subject) throw new LeaveStateConflictError();
      const roleMatchesSubject =
        (context.roleCode === 'HOST' && leave.host !== null) ||
        (context.roleCode === 'ARTIST' && leave.artist !== null);
      if (
        context.roleCode !== 'ADMIN' &&
        (!roleMatchesSubject || subject.userId !== context.userId)
      ) {
        throw new AuthorizationDeniedError();
      }
      if (leave.startDate <= toBusinessDate(now)) throw new LeaveDateRangeInvalidError();

      const restorableAppointments = leave.artist
        ? await this.restorableFixedAppointments(transaction, leave.id)
        : [];
      await this.lockFixedAppointmentRestorations(transaction, restorableAppointments);
      const updated = await transaction.leaveRecord.updateMany({
        data: {
          cancellationReason: reason ?? null,
          cancelledAt: now,
          cancelledByUserId: context.userId,
          rowVersion: { increment: 1 },
          status: 'CANCELLED',
        },
        where: { id: leave.id, rowVersion: command.expectedRowVersion, status: 'ACTIVE' },
      });
      if (updated.count !== 1) throw new LeaveStateConflictError();
      const restoredFixedAppointmentCount = await this.restoreFixedAppointments(
        transaction,
        context,
        restorableAppointments,
        leave.id,
      );
      await this.audit.append(transaction, context, {
        action: 'LEAVE_CANCELLED',
        afterData: {
          restoredFixedAppointmentCount,
          rowVersion: command.expectedRowVersion + 1,
          status: 'CANCELLED',
        },
        beforeData: { rowVersion: leave.rowVersion, status: leave.status },
        objectId: leave.id,
        objectType: 'LEAVE_RECORD',
        ...(reason ? { reason } : {}),
        siteId: subject.siteId,
      });
    });
  }

  private async resolveSelf(
    client: DatabaseClient | Prisma.TransactionClient,
    context: LeaveCommandContext,
  ): Promise<LeaveSubject> {
    if (context.roleCode === 'HOST') {
      const host = await client.hostProfile.findUnique({
        select: {
          id: true,
          qualificationStatus: true,
          qualificationValidUntil: true,
          siteId: true,
        },
        where: { userId: context.userId },
      });
      if (!host || !isHostQualifiedOn(host, new Date())) {
        throw new LeaveSubjectUnavailableError();
      }
      return { id: host.id, siteId: host.siteId, subjectType: 'HOST' };
    }
    if (context.roleCode === 'ARTIST') {
      const artist = await client.artistProfile.findUnique({
        select: { employmentStatus: true, id: true, siteId: true },
        where: { userId: context.userId },
      });
      if (!artist || artist.employmentStatus !== 'ACTIVE') throw new LeaveSubjectUnavailableError();
      return { id: artist.id, siteId: artist.siteId, subjectType: 'ARTIST' };
    }
    throw new AuthorizationDeniedError();
  }

  private appointmentCount(
    client: DatabaseClient | Prisma.TransactionClient,
    subject: LeaveSubject,
    range: LeaveDateRange,
  ): Promise<number> {
    return client.appointment.count({ where: this.appointmentWhere(subject, range) });
  }

  private appointmentWhere(
    subject: LeaveSubject,
    range: LeaveDateRange,
  ): Prisma.AppointmentWhereInput {
    return {
      appointmentDate: { gte: range.startDate, lte: range.endDate },
      status: 'BOOKED',
      ...(subject.subjectType === 'ARTIST' ? { artistId: subject.id } : { hostId: subject.id }),
    };
  }

  private restorableFixedAppointments(
    transaction: Prisma.TransactionClient,
    leaveId: string,
  ): Promise<RestorableFixedAppointment[]> {
    return transaction.appointment.findMany({
      orderBy: [{ appointmentDate: 'asc' }, { startAt: 'asc' }],
      select: RESTORABLE_FIXED_APPOINTMENT_SELECT,
      where: {
        cancellationReasonCode: 'ARTIST_LEAVE',
        cancellationSourceId: leaveId,
        cancellationSourceType: 'LEAVE_RECORD',
        fixedRuleId: { not: null },
        status: 'CANCELLED',
      },
    });
  }

  private async lockFixedAppointmentRestorations(
    transaction: Prisma.TransactionClient,
    appointments: readonly RestorableFixedAppointment[],
  ): Promise<void> {
    const keys = new Set<string>();
    for (const appointment of appointments) {
      const rule = appointment.fixedRule;
      if (!rule) continue;
      const date = formatDateOnly(appointment.appointmentDate);
      const weekday = isoWeekdayForDate(appointment.appointmentDate);
      keys.add(`appointment:artist:${appointment.artistId}:${date}`);
      keys.add(`appointment:host:${appointment.hostId}:${date}`);
      for (
        let minute = rule.startMinute;
        minute < rule.startMinute + rule.durationMinutes;
        minute += 15
      ) {
        keys.add(`fixed:artist:${appointment.artistId}:${weekday}:${minute}`);
        keys.add(`fixed:host:${appointment.hostId}:${weekday}:${minute}`);
      }
    }
    for (const key of [...keys].sort()) await acquireTransactionLock(transaction, key);
  }

  private async restoreFixedAppointments(
    transaction: Prisma.TransactionClient,
    context: LeaveCommandContext,
    appointments: readonly RestorableFixedAppointment[],
    leaveId: string,
  ): Promise<number> {
    let restored = 0;
    for (const appointment of appointments) {
      const rule = appointment.fixedRule;
      if (!rule || !this.ruleApplies(rule, appointment.appointmentDate)) continue;
      const active = await transaction.appointment.findMany({
        select: {
          artistId: true,
          dailySequence: true,
          endAt: true,
          hostId: true,
          startAt: true,
        },
        where: {
          appointmentDate: appointment.appointmentDate,
          OR: [{ artistId: appointment.artistId }, { hostId: appointment.hostId }],
          status: { in: ['BOOKED', 'COMPLETED'] },
        },
      });
      if (
        active.some(
          (item) =>
            appointment.startAt < item.endAt &&
            item.startAt < appointment.endAt &&
            (item.artistId === appointment.artistId || item.hostId === appointment.hostId),
        )
      ) {
        throw new LeaveFixedAppointmentRestoreConflictError();
      }
      const hostAppointments = active.filter((item) => item.hostId === appointment.hostId);
      if (hostAppointments.length >= 2) throw new LeaveFixedAppointmentRestoreConflictError();
      const dailySequence = hostAppointments.some((item) => item.dailySequence === 1) ? 2 : 1;
      const updated = await transaction.appointment.updateMany({
        data: {
          cancellationReasonCode: null,
          cancellationReasonText: null,
          cancellationSourceId: null,
          cancellationSourceType: null,
          cancelledAt: null,
          cancelledByUserId: null,
          dailySequence,
          rowVersion: { increment: 1 },
          status: 'BOOKED',
        },
        where: {
          cancellationSourceId: leaveId,
          cancellationSourceType: 'LEAVE_RECORD',
          id: appointment.id,
          rowVersion: appointment.rowVersion,
          status: 'CANCELLED',
        },
      });
      if (updated.count !== 1) throw new LeaveStateConflictError();
      await this.audit.append(transaction, context, {
        action: 'FIXED_APPOINTMENT_RESTORED_AFTER_LEAVE_CANCEL',
        afterData: {
          dailySequence,
          rowVersion: appointment.rowVersion + 1,
          status: 'BOOKED',
        },
        beforeData: { rowVersion: appointment.rowVersion, status: 'CANCELLED' },
        objectId: appointment.id,
        objectType: 'APPOINTMENT',
        siteId: appointment.siteId,
      });
      restored += 1;
    }
    return restored;
  }

  private ruleApplies(
    rule: NonNullable<RestorableFixedAppointment['fixedRule']>,
    date: Date,
  ): boolean {
    return (
      rule.status === 'ACTIVE' &&
      rule.validFrom <= date &&
      (!rule.validUntil || rule.validUntil > date) &&
      rule.weekdays.some((weekday) => weekday.isoWeekday === isoWeekdayForDate(date))
    );
  }

  private async lockSchedule(
    transaction: Prisma.TransactionClient,
    subject: LeaveSubject,
    range: LeaveDateRange,
  ): Promise<void> {
    const prefix = subject.subjectType === 'ARTIST' ? 'artist' : 'host';
    for (
      let date = new Date(range.startDate);
      date <= range.endDate;
      date.setUTCDate(date.getUTCDate() + 1)
    ) {
      await acquireTransactionLock(
        transaction,
        `appointment:${prefix}:${subject.id}:${formatDateOnly(date)}`,
      );
    }
  }

  private toPreview(
    subject: LeaveSubject,
    range: LeaveDateRange,
    affectedAppointmentCount: number,
  ): LeaveImpactPreview {
    return {
      affectedAppointmentCount,
      endDate: formatDateOnly(range.endDate),
      startDate: formatDateOnly(range.startDate),
      subjectId: subject.id,
      subjectType: subject.subjectType,
    };
  }

  private toSummary(leave: {
    affectedAppointmentCount: number;
    artistId: string | null;
    endDate: Date;
    hostId: string | null;
    id: string;
    reason: string | null;
    rowVersion: number;
    startDate: Date;
    status: string;
    subjectType: string;
  }): LeaveSummary {
    return {
      affectedAppointmentCount: leave.affectedAppointmentCount,
      endDate: formatDateOnly(leave.endDate),
      id: leave.id,
      reason: leave.reason,
      rowVersion: leave.rowVersion,
      startDate: formatDateOnly(leave.startDate),
      status: leave.status as LeaveSummary['status'],
      subjectId: (leave.hostId ?? leave.artistId)!,
      subjectType: leave.subjectType as LeaveSummary['subjectType'],
    };
  }
}
