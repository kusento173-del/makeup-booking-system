import { Prisma, type DatabaseClient } from '@makeup/database';
import { Injectable } from '@nestjs/common';

import { ArtistAvailabilityService } from '../availability/artist-availability.service';
import { AuditCommandService } from '../audit/audit-command.service';
import {
  affectedAppointmentSnapshot,
  findAffectedAppointments,
  parseAffectedAppointmentSnapshot,
  toAffectedAppointment,
  type AffectedAppointmentRecord,
  type AffectedAppointmentSummary,
} from '../absence/affected-appointment';
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
  ArtistUnavailablePeriodApprovalItem,
  ArtistUnavailablePeriodReviewedItem,
  ArtistUnavailablePeriodRange,
  ArtistUnavailablePeriodSummary,
  ArtistUnavailablePeriodTarget,
  ArtistUnavailabilityCommandContext,
  CancelArtistUnavailablePeriodCommand,
  CreateArtistUnavailablePeriodCommand,
  ReviewArtistUnavailablePeriodCommand,
} from './artist-unavailability.types';

interface ArtistSubject {
  readonly id: string;
  readonly siteId: string;
  readonly userId: string | null;
}

const PERIOD_SELECT = {
  affectedAppointmentCount: true,
  artistId: true,
  endMinute: true,
  id: true,
  reason: true,
  reviewComment: true,
  reviewedAt: true,
  reviewImpactSnapshot: true,
  rowVersion: true,
  siteId: true,
  startMinute: true,
  status: true,
  unavailableDate: true,
} satisfies Prisma.ArtistUnavailablePeriodSelect;

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
      return this.toPreview(
        artist,
        range,
        await this.affectedAppointments(client, artist.id, range),
      );
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
        select: PERIOD_SELECT,
        where: {
          artistId: artist.id,
          status: { in: ['ACTIVE', 'CANCELLED', 'PENDING', 'REJECTED'] },
          unavailableDate: { gte: toBusinessDate(now) },
        },
      });
      return Promise.all(
        periods.map(async (period) => {
          const affectedAppointments = await this.affectedAppointments(client, artist.id, period);
          return this.toSummary(
            period.status === 'PENDING'
              ? { ...period, affectedAppointmentCount: affectedAppointments.length }
              : period,
            affectedAppointments,
          );
        }),
      );
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
        const affectedAppointments = await this.affectedAppointments(
          transaction,
          artist.id,
          command,
        );
        const affectedAppointmentCount = affectedAppointments.length;
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
            status: context.roleCode === 'ARTIST' ? 'PENDING' : 'ACTIVE',
            unavailableDate: command.unavailableDate,
          },
          select: PERIOD_SELECT,
        });
        const summary = this.toSummary(period, affectedAppointments);
        if (context.roleCode !== 'ARTIST') {
          const cancelled = await transaction.appointment.updateMany({
            data: {
              cancellationReasonCode: 'ARTIST_LEAVE',
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
        }
        await this.audit.append(transaction, context, {
          action:
            context.roleCode === 'ARTIST'
              ? 'ARTIST_UNAVAILABLE_PERIOD_SUBMITTED'
              : 'ARTIST_UNAVAILABLE_PERIOD_CREATED',
          afterData: {
            affectedAppointmentCount: summary.affectedAppointmentCount,
            id: summary.id,
            rowVersion: summary.rowVersion,
            status: summary.status,
            unavailableDate: summary.unavailableDate,
          },
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

  listPending(
    context: ArtistUnavailabilityCommandContext,
    now = new Date(),
  ): Promise<readonly ArtistUnavailablePeriodApprovalItem[]> {
    this.authorization.assertRole(context, ['CUSTOMER_SERVICE', 'ADMIN']);
    return this.database.read(async (client) => {
      const periods = await client.artistUnavailablePeriod.findMany({
        orderBy: [{ unavailableDate: 'asc' }, { startMinute: 'asc' }, { createdAt: 'asc' }],
        select: {
          ...PERIOD_SELECT,
          artist: { select: { nickname: true } },
          createdAt: true,
        },
        where: {
          status: 'PENDING',
          unavailableDate: { gte: toBusinessDate(now) },
          ...(context.roleCode === 'CUSTOMER_SERVICE' ? { siteId: context.siteId ?? '' } : {}),
        },
      });
      return Promise.all(
        periods.map(async (period) => {
          const affectedAppointments = await this.affectedAppointments(
            client,
            period.artistId,
            period,
          );
          return {
            ...this.toSummary(
              { ...period, affectedAppointmentCount: affectedAppointments.length },
              affectedAppointments,
            ),
            artistNickname: period.artist.nickname,
            submittedAt: period.createdAt.toISOString(),
          };
        }),
      );
    });
  }

  listReviewed(
    context: ArtistUnavailabilityCommandContext,
  ): Promise<readonly ArtistUnavailablePeriodReviewedItem[]> {
    this.authorization.assertRole(context, ['CUSTOMER_SERVICE', 'ADMIN']);
    return this.database.read(async (client) => {
      const periods = await client.artistUnavailablePeriod.findMany({
        orderBy: [{ reviewedAt: 'desc' }, { createdAt: 'desc' }],
        select: {
          ...PERIOD_SELECT,
          artist: { select: { nickname: true } },
          createdAt: true,
        },
        take: 100,
        where: {
          reviewedAt: { not: null },
          ...(context.roleCode === 'CUSTOMER_SERVICE' ? { siteId: context.siteId ?? '' } : {}),
        },
      });
      return periods.map((period) => {
        if (!period.reviewedAt) throw new ArtistUnavailablePeriodStateConflictError();
        const affectedAppointments = parseAffectedAppointmentSnapshot(period.reviewImpactSnapshot);
        return {
          ...this.toSummary(
            { ...period, affectedAppointmentCount: affectedAppointments.length },
            [],
            affectedAppointments,
          ),
          artistNickname: period.artist.nickname,
          reviewedAt: period.reviewedAt.toISOString(),
          submittedAt: period.createdAt.toISOString(),
        };
      });
    });
  }

  review(
    context: ArtistUnavailabilityCommandContext,
    command: ReviewArtistUnavailablePeriodCommand,
    now = new Date(),
  ): Promise<ArtistUnavailablePeriodSummary> {
    this.authorization.assertRole(context, ['CUSTOMER_SERVICE', 'ADMIN']);
    const normalizedComment = reason(command.comment, command.decision === 'REJECT');

    return this.database.transaction(async (transaction) => {
      const period = await transaction.artistUnavailablePeriod.findUnique({
        select: PERIOD_SELECT,
        where: { id: command.periodId },
      });
      if (!period) throw new ArtistUnavailablePeriodNotFoundError();
      this.authorization.assertSiteScope(context, period.siteId);
      if (period.unavailableDate <= toBusinessDate(now)) {
        throw new ArtistUnavailablePeriodDateInvalidError();
      }
      await acquireTransactionLock(
        transaction,
        `appointment:artist:${period.artistId}:${formatDateOnly(period.unavailableDate)}`,
      );
      const affectedAppointments = await this.affectedAppointments(
        transaction,
        period.artistId,
        period,
      );
      if (affectedAppointments.length !== command.confirmedAffectedAppointmentCount) {
        throw new ArtistUnavailablePeriodImpactChangedError();
      }

      const status = command.decision === 'APPROVE' ? 'ACTIVE' : 'REJECTED';
      const updated = await transaction.artistUnavailablePeriod.updateMany({
        data: {
          affectedAppointmentCount: affectedAppointments.length,
          reviewComment: normalizedComment ?? null,
          reviewImpactSnapshot: affectedAppointmentSnapshot(affectedAppointments),
          reviewedAt: now,
          reviewedByUserId: context.userId,
          rowVersion: { increment: 1 },
          status,
        },
        where: {
          id: period.id,
          rowVersion: command.expectedRowVersion,
          status: 'PENDING',
        },
      });
      if (updated.count !== 1) throw new ArtistUnavailablePeriodStateConflictError();

      if (status === 'ACTIVE') {
        const cancelled = await transaction.appointment.updateMany({
          data: {
            cancellationReasonCode: 'ARTIST_LEAVE',
            cancellationReasonText: period.reason,
            cancellationSourceId: period.id,
            cancellationSourceType: 'ARTIST_UNAVAILABLE_PERIOD',
            cancelledAt: now,
            cancelledByUserId: context.userId,
            rowVersion: { increment: 1 },
            status: 'CANCELLED',
          },
          where: this.appointmentWhere(period.artistId, period),
        });
        if (cancelled.count !== affectedAppointments.length) {
          throw new ArtistUnavailablePeriodImpactChangedError();
        }
      }

      const summary = this.toSummary(
        {
          ...period,
          affectedAppointmentCount: affectedAppointments.length,
          reviewComment: normalizedComment ?? null,
          rowVersion: period.rowVersion + 1,
          status,
        },
        affectedAppointments,
      );
      await this.audit.append(transaction, context, {
        action: `ARTIST_UNAVAILABLE_PERIOD_${status === 'ACTIVE' ? 'APPROVED' : 'REJECTED'}`,
        afterData: {
          affectedAppointmentCount: summary.affectedAppointmentCount,
          id: summary.id,
          rowVersion: summary.rowVersion,
          status: summary.status,
          unavailableDate: summary.unavailableDate,
        },
        beforeData: { rowVersion: period.rowVersion, status: period.status },
        objectId: period.id,
        objectType: 'ARTIST_UNAVAILABLE_PERIOD',
        ...(normalizedComment ? { reason: normalizedComment } : {}),
        siteId: period.siteId,
      });
      return summary;
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
          status: { in: ['ACTIVE', 'PENDING'] },
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

  private affectedAppointments(
    client: DatabaseClient | Prisma.TransactionClient,
    artistId: string,
    range: ArtistUnavailablePeriodRange,
  ): Promise<readonly AffectedAppointmentRecord[]> {
    return findAffectedAppointments(client, this.appointmentWhere(artistId, range));
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
    affectedAppointments: readonly AffectedAppointmentRecord[],
  ): ArtistUnavailablePeriodPreview {
    return {
      affectedAppointmentCount: affectedAppointments.length,
      affectedAppointments: affectedAppointments.map(toAffectedAppointment),
      artistId: artist.id,
      endMinute: range.endMinute,
      siteId: artist.siteId,
      startMinute: range.startMinute,
      unavailableDate: formatDateOnly(range.unavailableDate),
    };
  }

  private toSummary(
    period: {
      affectedAppointmentCount: number;
      artistId: string;
      endMinute: number;
      id: string;
      reason: string;
      reviewComment: string | null;
      rowVersion: number;
      siteId: string;
      startMinute: number;
      status: string;
      unavailableDate: Date;
    },
    affectedAppointments: readonly AffectedAppointmentRecord[],
    affectedAppointmentSummaries?: readonly AffectedAppointmentSummary[],
  ): ArtistUnavailablePeriodSummary {
    return {
      affectedAppointmentCount: period.affectedAppointmentCount,
      affectedAppointments:
        affectedAppointmentSummaries ?? affectedAppointments.map(toAffectedAppointment),
      artistId: period.artistId,
      endMinute: period.endMinute,
      id: period.id,
      reason: period.reason,
      reviewComment: period.reviewComment,
      rowVersion: period.rowVersion,
      siteId: period.siteId,
      startMinute: period.startMinute,
      status: period.status as ArtistUnavailablePeriodSummary['status'],
      unavailableDate: formatDateOnly(period.unavailableDate),
    };
  }
}
