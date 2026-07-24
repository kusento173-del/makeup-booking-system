import { Prisma, type DatabaseClient } from '@makeup/database';
import { Injectable } from '@nestjs/common';

import { ArtistAvailabilityService } from '../availability/artist-availability.service';
import { AuditCommandService } from '../audit/audit-command.service';
import {
  AuthorizationDeniedError,
  AuthorizationPolicyService,
} from '../auth/authorization-policy.service';
import { DatabaseService } from '../database/database.service';
import { acquireTransactionLock } from '../database/transaction-lock';
import {
  businessDateMinuteToInstant,
  formatDateOnly,
  toBusinessDate,
} from '../shift/business-date';
import {
  ArtistUnavailablePeriodDateInvalidError,
  ArtistUnavailablePeriodImpactChangedError,
  ArtistUnavailablePeriodNotFoundError,
  ArtistUnavailablePeriodReasonInvalidError,
  ArtistUnavailablePeriodScheduleConflictError,
  ArtistUnavailablePeriodStateConflictError,
  ArtistUnavailablePeriodTargetInvalidError,
} from './artist-unavailability.errors';
import type {
  ArtistUnavailablePeriodPreview,
  ArtistUnavailablePeriodRange,
  ArtistUnavailablePeriodSummary,
  ArtistUnavailablePeriodTarget,
  ArtistUnavailabilityCommandContext,
  CancelArtistUnavailablePeriodCommand,
  CreateArtistUnavailablePeriodCommand,
} from './artist-unavailability.types';

interface ArtistSubject {
  readonly id: string;
  readonly siteId: string;
  readonly userId: string | null;
}

function reason(value: string | undefined, required: boolean): string | undefined {
  const normalized = value?.normalize('NFKC').trim();
  if ((!normalized && required) || (normalized && normalized.length > 500)) {
    throw new ArtistUnavailablePeriodReasonInvalidError();
  }
  return normalized || undefined;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function assertDateOnly(value: Date): void {
  if (
    Number.isNaN(value.getTime()) ||
    value.getUTCHours() !== 0 ||
    value.getUTCMinutes() !== 0 ||
    value.getUTCSeconds() !== 0 ||
    value.getUTCMilliseconds() !== 0
  ) {
    throw new ArtistUnavailablePeriodDateInvalidError();
  }
}

function validateDate(date: Date, context: ArtistUnavailabilityCommandContext, now: Date): void {
  assertDateOnly(date);
  const today = toBusinessDate(now);
  const earliest = context.roleCode === 'ARTIST' ? addDays(today, 1) : today;
  if (date < earliest || date > addDays(today, 7)) {
    throw new ArtistUnavailablePeriodDateInvalidError();
  }
}

@Injectable()
export class ArtistUnavailabilityService {
  constructor(
    private readonly audit: AuditCommandService,
    private readonly availability: ArtistAvailabilityService,
    private readonly authorization: AuthorizationPolicyService,
    private readonly database: DatabaseService,
  ) {}

  preview(
    context: ArtistUnavailabilityCommandContext,
    range: ArtistUnavailablePeriodRange,
    now = new Date(),
  ): Promise<ArtistUnavailablePeriodPreview> {
    validateDate(range.unavailableDate, context, now);
    return this.database.read(async (client) => {
      const artist = await this.resolveArtist(client, context, range.artistId);
      await this.assertFitsSchedule(client, artist.id, range);
      return this.toPreview(artist, range, await this.appointmentCount(client, artist.id, range));
    });
  }

  list(
    context: ArtistUnavailabilityCommandContext,
    target: ArtistUnavailablePeriodTarget,
    now = new Date(),
  ): Promise<readonly ArtistUnavailablePeriodSummary[]> {
    return this.database.read(async (client) => {
      const artist = await this.resolveArtist(client, context, target.artistId);
      const periods = await client.artistUnavailablePeriod.findMany({
        orderBy: [{ unavailableDate: 'asc' }, { startMinute: 'asc' }],
        select: {
          affectedAppointmentCount: true,
          artistId: true,
          endMinute: true,
          id: true,
          reason: true,
          rowVersion: true,
          siteId: true,
          startMinute: true,
          status: true,
          unavailableDate: true,
        },
        where: {
          artistId: artist.id,
          status: 'ACTIVE',
          unavailableDate: { gte: toBusinessDate(now) },
        },
      });
      return periods.map((period) => this.toSummary(period));
    });
  }

  create(
    context: ArtistUnavailabilityCommandContext,
    command: CreateArtistUnavailablePeriodCommand,
    now = new Date(),
  ): Promise<ArtistUnavailablePeriodSummary> {
    validateDate(command.unavailableDate, context, now);
    const normalizedReason = reason(command.reason, true)!;

    return this.database
      .transaction(async (transaction) => {
        const artist = await this.resolveArtist(transaction, context, command.artistId);
        await acquireTransactionLock(
          transaction,
          `appointment:artist:${artist.id}:${formatDateOnly(command.unavailableDate)}`,
        );
        await this.assertFitsSchedule(transaction, artist.id, command);
        const affectedAppointmentCount = await this.appointmentCount(
          transaction,
          artist.id,
          command,
        );
        if (affectedAppointmentCount !== command.confirmedAffectedAppointmentCount) {
          throw new ArtistUnavailablePeriodImpactChangedError();
        }

        const period = await transaction.artistUnavailablePeriod.create({
          data: {
            affectedAppointmentCount,
            artistId: artist.id,
            createdByUserId: context.userId,
            endMinute: command.endMinute,
            reason: normalizedReason,
            siteId: artist.siteId,
            startMinute: command.startMinute,
            unavailableDate: command.unavailableDate,
          },
          select: {
            affectedAppointmentCount: true,
            artistId: true,
            endMinute: true,
            id: true,
            reason: true,
            rowVersion: true,
            siteId: true,
            startMinute: true,
            status: true,
            unavailableDate: true,
          },
        });
        const summary = this.toSummary(period);
        const cancelled = await transaction.appointment.updateMany({
          data: {
            cancellationReasonCode: 'ARTIST_UNAVAILABLE_PERIOD',
            cancellationReasonText: normalizedReason,
            cancellationSourceId: period.id,
            cancellationSourceType: 'ARTIST_UNAVAILABLE_PERIOD',
            cancelledAt: now,
            cancelledByUserId: context.userId,
            rowVersion: { increment: 1 },
            status: 'CANCELLED',
          },
          where: this.appointmentWhere(artist.id, command),
        });
        if (cancelled.count !== affectedAppointmentCount) {
          throw new ArtistUnavailablePeriodImpactChangedError();
        }
        await this.audit.append(transaction, context, {
          action: 'ARTIST_UNAVAILABLE_PERIOD_CREATED',
          afterData: { ...summary },
          objectId: period.id,
          objectType: 'ARTIST_UNAVAILABLE_PERIOD',
          reason: normalizedReason,
          siteId: artist.siteId,
        });
        return summary;
      })
      .catch((error: unknown) => {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2004') {
          throw new ArtistUnavailablePeriodStateConflictError();
        }
        throw error;
      });
  }

  cancel(
    context: ArtistUnavailabilityCommandContext,
    command: CancelArtistUnavailablePeriodCommand,
    now = new Date(),
  ): Promise<void> {
    this.authorization.assertRole(context, ['ARTIST', 'CUSTOMER_SERVICE', 'ADMIN']);
    const normalizedReason = reason(command.reason, context.roleCode !== 'ARTIST');

    return this.database.transaction(async (transaction) => {
      const period = await transaction.artistUnavailablePeriod.findUnique({
        select: {
          artist: { select: { siteId: true, userId: true } },
          id: true,
          rowVersion: true,
          status: true,
          unavailableDate: true,
        },
        where: { id: command.periodId },
      });
      if (!period) throw new ArtistUnavailablePeriodNotFoundError();
      this.assertArtistScope(context, period.artist);

      const today = toBusinessDate(now);
      const earliest = context.roleCode === 'ARTIST' ? addDays(today, 1) : today;
      if (period.unavailableDate < earliest) {
        throw new ArtistUnavailablePeriodDateInvalidError();
      }

      const updated = await transaction.artistUnavailablePeriod.updateMany({
        data: {
          cancellationReason: normalizedReason ?? null,
          cancelledAt: now,
          cancelledByUserId: context.userId,
          rowVersion: { increment: 1 },
          status: 'CANCELLED',
        },
        where: {
          id: period.id,
          rowVersion: command.expectedRowVersion,
          status: 'ACTIVE',
        },
      });
      if (updated.count !== 1) throw new ArtistUnavailablePeriodStateConflictError();
      await this.audit.append(transaction, context, {
        action: 'ARTIST_UNAVAILABLE_PERIOD_CANCELLED',
        afterData: {
          rowVersion: command.expectedRowVersion + 1,
          status: 'CANCELLED',
        },
        beforeData: { rowVersion: period.rowVersion, status: period.status },
        objectId: period.id,
        objectType: 'ARTIST_UNAVAILABLE_PERIOD',
        ...(normalizedReason ? { reason: normalizedReason } : {}),
        siteId: period.artist.siteId,
      });
    });
  }

  private async resolveArtist(
    client: DatabaseClient | Prisma.TransactionClient,
    context: ArtistUnavailabilityCommandContext,
    targetArtistId: string | undefined,
  ): Promise<ArtistSubject> {
    this.authorization.assertRole(context, ['ARTIST', 'CUSTOMER_SERVICE', 'ADMIN']);
    const artist =
      context.roleCode === 'ARTIST'
        ? await client.artistProfile.findUnique({
            select: { employmentStatus: true, id: true, siteId: true, userId: true },
            where: { userId: context.userId },
          })
        : targetArtistId
          ? await client.artistProfile.findUnique({
              select: { employmentStatus: true, id: true, siteId: true, userId: true },
              where: { id: targetArtistId },
            })
          : null;
    if (!artist || artist.employmentStatus !== 'ACTIVE') {
      throw new ArtistUnavailablePeriodTargetInvalidError();
    }
    if (targetArtistId && targetArtistId !== artist.id) {
      throw new AuthorizationDeniedError();
    }
    this.assertArtistScope(context, artist);
    return artist;
  }

  private assertArtistScope(
    context: ArtistUnavailabilityCommandContext,
    artist: Pick<ArtistSubject, 'siteId' | 'userId'>,
  ): void {
    if (context.roleCode === 'ARTIST') {
      this.authorization.assertSelfScope(context, artist.userId ?? '');
      return;
    }
    this.authorization.assertSiteScope(context, artist.siteId);
  }

  private async assertFitsSchedule(
    client: DatabaseClient | Prisma.TransactionClient,
    artistId: string,
    range: ArtistUnavailablePeriodRange,
  ): Promise<void> {
    const availability = await this.availability.getDayWithClient(
      client,
      artistId,
      range.unavailableDate,
    );
    if (
      !availability.available ||
      !availability.intervals.some(
        (interval) =>
          interval.startMinute <= range.startMinute && range.endMinute <= interval.endMinute,
      )
    ) {
      throw new ArtistUnavailablePeriodScheduleConflictError();
    }
  }

  private appointmentCount(
    client: DatabaseClient | Prisma.TransactionClient,
    artistId: string,
    range: ArtistUnavailablePeriodRange,
  ): Promise<number> {
    return client.appointment.count({ where: this.appointmentWhere(artistId, range) });
  }

  private appointmentWhere(
    artistId: string,
    range: ArtistUnavailablePeriodRange,
  ): Prisma.AppointmentWhereInput {
    const startAt = businessDateMinuteToInstant(range.unavailableDate, range.startMinute);
    const endAt = businessDateMinuteToInstant(range.unavailableDate, range.endMinute);
    return {
      artistId,
      appointmentDate: range.unavailableDate,
      endAt: { gt: startAt },
      startAt: { lt: endAt },
      status: 'BOOKED',
    };
  }

  private toPreview(
    artist: ArtistSubject,
    range: ArtistUnavailablePeriodRange,
    affectedAppointmentCount: number,
  ): ArtistUnavailablePeriodPreview {
    return {
      affectedAppointmentCount,
      artistId: artist.id,
      endMinute: range.endMinute,
      siteId: artist.siteId,
      startMinute: range.startMinute,
      unavailableDate: formatDateOnly(range.unavailableDate),
    };
  }

  private toSummary(period: {
    affectedAppointmentCount: number;
    artistId: string;
    endMinute: number;
    id: string;
    reason: string;
    rowVersion: number;
    siteId: string;
    startMinute: number;
    status: string;
    unavailableDate: Date;
  }): ArtistUnavailablePeriodSummary {
    return {
      affectedAppointmentCount: period.affectedAppointmentCount,
      artistId: period.artistId,
      endMinute: period.endMinute,
      id: period.id,
      reason: period.reason,
      rowVersion: period.rowVersion,
      siteId: period.siteId,
      startMinute: period.startMinute,
      status: period.status as ArtistUnavailablePeriodSummary['status'],
      unavailableDate: formatDateOnly(period.unavailableDate),
    };
  }
}
