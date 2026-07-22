import { Prisma } from '@makeup/database';
import { Injectable } from '@nestjs/common';

import { AuditCommandService } from '../audit/audit-command.service';
import {
  AuthorizationDeniedError,
  AuthorizationPolicyService,
} from '../auth/authorization-policy.service';
import { DatabaseService } from '../database/database.service';
import { formatDateOnly, toBusinessDate } from '../shift/business-date';
import { validateShiftDefinition } from '../shift/shift-time';
import {
  OvertimeArtistNotFoundError,
  OvertimeArtistUnavailableError,
  OvertimeDateInvalidError,
  OvertimeNotFoundError,
  OvertimePendingExistsError,
  OvertimeReasonInvalidError,
  OvertimeShiftNotConfiguredError,
  OvertimeStateConflictError,
  OvertimeWorkingDayError,
} from './overtime.errors';
import type {
  DirectApproveOvertimeCommand,
  OvertimeCommandContext,
  OvertimeDefinition,
  OvertimeSummary,
  ReviewOvertimeCommand,
  SubmitOvertimeCommand,
  WithdrawOvertimeCommand,
} from './overtime.types';

const OVERTIME_SELECT = {
  affectedAppointmentCount: true,
  artistId: true,
  breakEndMinute: true,
  breakStartMinute: true,
  id: true,
  overtimeDate: true,
  reason: true,
  rowVersion: true,
  siteId: true,
  status: true,
  submittedAt: true,
  workEndMinute: true,
  workStartMinute: true,
} satisfies Prisma.ArtistOvertimeSelect;

const REVIEW_SELECT = {
  ...OVERTIME_SELECT,
  artist: { select: { employmentStatus: true, siteId: true, userId: true } },
  submittedByUserId: true,
} satisfies Prisma.ArtistOvertimeSelect;

type OvertimeRecord = Prisma.ArtistOvertimeGetPayload<{ select: typeof OVERTIME_SELECT }>;
type ReviewRecord = Prisma.ArtistOvertimeGetPayload<{ select: typeof REVIEW_SELECT }>;

function normalizedRequiredText(value: string): string {
  const result = value.normalize('NFKC').trim();
  if (!result || result.length > 500) throw new OvertimeReasonInvalidError();
  return result;
}

function normalizedOptionalText(value: string | undefined): string | undefined {
  return value === undefined ? undefined : normalizedRequiredText(value);
}

function validateDate(value: Date, now: Date): void {
  if (
    Number.isNaN(value.getTime()) ||
    value.getUTCHours() !== 0 ||
    value.getUTCMinutes() !== 0 ||
    value.getUTCSeconds() !== 0 ||
    value.getUTCMilliseconds() !== 0
  ) {
    throw new OvertimeDateInvalidError();
  }
  const today = toBusinessDate(now);
  const tomorrow = new Date(today);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const lastDate = new Date(today);
  lastDate.setUTCDate(lastDate.getUTCDate() + 7);
  if (value < tomorrow || value > lastDate) throw new OvertimeDateInvalidError();
}

function validateDefinition(definition: OvertimeDefinition): void {
  validateShiftDefinition({ ...definition, workdays: [1] });
}

function isoWeekday(date: Date): number {
  return date.getUTCDay() || 7;
}

@Injectable()
export class OvertimeService {
  constructor(
    private readonly audit: AuditCommandService,
    private readonly authorization: AuthorizationPolicyService,
    private readonly database: DatabaseService,
  ) {}

  submit(
    context: OvertimeCommandContext,
    command: SubmitOvertimeCommand,
    now = new Date(),
  ): Promise<OvertimeSummary> {
    this.authorization.assertRole(context, ['ARTIST']);
    validateDate(command.overtimeDate, now);
    validateDefinition(command);
    const reason = normalizedRequiredText(command.reason);

    return this.database.transaction(async (transaction) => {
      const artist = await this.artist(transaction, command.artistId);
      if (artist.userId !== context.userId) throw new AuthorizationDeniedError();
      await this.assertNonWorkingDay(transaction, artist.id, command.overtimeDate);
      return this.create(transaction, context, command, artist.siteId, reason, 'PENDING', now);
    });
  }

  withdraw(context: OvertimeCommandContext, command: WithdrawOvertimeCommand): Promise<void> {
    this.authorization.assertRole(context, ['ARTIST']);
    return this.database.transaction(async (transaction) => {
      const request = await transaction.artistOvertime.findUnique({
        select: REVIEW_SELECT,
        where: { id: command.overtimeId },
      });
      if (!request) throw new OvertimeNotFoundError();
      if (request.artist.userId !== context.userId) throw new AuthorizationDeniedError();

      const updated = await transaction.artistOvertime.updateMany({
        data: { rowVersion: { increment: 1 }, status: 'WITHDRAWN' },
        where: {
          id: request.id,
          rowVersion: command.expectedRowVersion,
          status: 'PENDING',
        },
      });
      if (updated.count !== 1) throw new OvertimeStateConflictError();
      await this.audit.append(transaction, context, {
        action: 'ARTIST_OVERTIME_WITHDRAWN',
        afterData: { rowVersion: command.expectedRowVersion + 1, status: 'WITHDRAWN' },
        beforeData: { rowVersion: request.rowVersion, status: request.status },
        objectId: request.id,
        objectType: 'ARTIST_OVERTIME',
        siteId: request.siteId,
      });
    });
  }

  review(
    context: OvertimeCommandContext,
    command: ReviewOvertimeCommand,
    now = new Date(),
  ): Promise<OvertimeSummary> {
    this.authorization.assertRole(context, ['CUSTOMER_SERVICE', 'ADMIN']);
    const comment = normalizedOptionalText(command.comment);

    return this.database.transaction(async (transaction) => {
      const request = await transaction.artistOvertime.findUnique({
        select: REVIEW_SELECT,
        where: { id: command.overtimeId },
      });
      if (!request) throw new OvertimeNotFoundError();
      this.authorization.assertSiteScope(context, request.siteId);
      if (request.submittedByUserId === context.userId) throw new AuthorizationDeniedError();
      if (
        request.status !== 'PENDING' ||
        request.rowVersion !== command.expectedRowVersion ||
        request.artist.siteId !== request.siteId ||
        request.artist.employmentStatus !== 'ACTIVE'
      ) {
        throw new OvertimeStateConflictError();
      }
      if (command.decision === 'APPROVE') {
        validateDate(request.overtimeDate, now);
        if (request.affectedAppointmentCount !== 0) throw new OvertimeStateConflictError();
        await this.assertNonWorkingDay(transaction, request.artistId, request.overtimeDate);
      }
      return this.finishReview(transaction, context, request, command.decision, comment, now);
    });
  }

  directApprove(
    context: OvertimeCommandContext,
    command: DirectApproveOvertimeCommand,
    now = new Date(),
  ): Promise<OvertimeSummary> {
    this.authorization.assertRole(context, ['CUSTOMER_SERVICE', 'ADMIN']);
    validateDate(command.overtimeDate, now);
    validateDefinition(command);
    const reason = normalizedRequiredText(command.reason);

    return this.database.transaction(async (transaction) => {
      const artist = await this.artist(transaction, command.artistId);
      this.authorization.assertSiteScope(context, artist.siteId);
      await this.assertNonWorkingDay(transaction, artist.id, command.overtimeDate);
      return this.create(transaction, context, command, artist.siteId, reason, 'APPROVED', now);
    });
  }

  private async artist(transaction: Prisma.TransactionClient, artistId: string) {
    const artist = await transaction.artistProfile.findUnique({
      select: { employmentStatus: true, id: true, siteId: true, userId: true },
      where: { id: artistId },
    });
    if (!artist) throw new OvertimeArtistNotFoundError();
    if (artist.employmentStatus !== 'ACTIVE') throw new OvertimeArtistUnavailableError();
    return artist;
  }

  private async assertNonWorkingDay(
    transaction: Prisma.TransactionClient,
    artistId: string,
    overtimeDate: Date,
  ): Promise<void> {
    const shift = await transaction.artistShiftTemplate.findFirst({
      orderBy: { versionNo: 'desc' },
      select: { workdays: true },
      where: {
        artistId,
        validFrom: { lte: overtimeDate },
        OR: [{ validUntil: null }, { validUntil: { gt: overtimeDate } }],
      },
    });
    if (!shift) throw new OvertimeShiftNotConfiguredError();
    if (shift.workdays.includes(isoWeekday(overtimeDate))) throw new OvertimeWorkingDayError();
  }

  private async create(
    transaction: Prisma.TransactionClient,
    context: OvertimeCommandContext,
    command: SubmitOvertimeCommand,
    siteId: string,
    reason: string,
    status: 'APPROVED' | 'PENDING',
    now: Date,
  ): Promise<OvertimeSummary> {
    try {
      const request = await transaction.artistOvertime.create({
        data: {
          artistId: command.artistId,
          breakEndMinute: command.breakEndMinute,
          breakStartMinute: command.breakStartMinute,
          overtimeDate: command.overtimeDate,
          reason,
          ...(status === 'APPROVED'
            ? {
                reviewedAt: now,
                reviewedByUserId: context.userId,
                status,
              }
            : {}),
          siteId,
          submittedByUserId: context.userId,
          workEndMinute: command.workEndMinute,
          workStartMinute: command.workStartMinute,
        },
        select: OVERTIME_SELECT,
      });
      const summary = this.toSummary(request);
      await this.audit.append(transaction, context, {
        action:
          status === 'APPROVED' ? 'ARTIST_OVERTIME_DIRECTLY_APPROVED' : 'ARTIST_OVERTIME_SUBMITTED',
        afterData: { ...summary },
        objectId: request.id,
        objectType: 'ARTIST_OVERTIME',
        reason,
        siteId: request.siteId,
      });
      return summary;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new OvertimePendingExistsError();
      }
      throw error;
    }
  }

  private async finishReview(
    transaction: Prisma.TransactionClient,
    context: OvertimeCommandContext,
    request: ReviewRecord,
    decision: 'APPROVE' | 'REJECT',
    comment: string | undefined,
    now: Date,
  ): Promise<OvertimeSummary> {
    const status = decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
    const updated = await transaction.artistOvertime.updateMany({
      data: {
        reviewComment: comment ?? null,
        reviewedAt: now,
        reviewedByUserId: context.userId,
        rowVersion: { increment: 1 },
        status,
      },
      where: { id: request.id, rowVersion: request.rowVersion, status: 'PENDING' },
    });
    if (updated.count !== 1) throw new OvertimeStateConflictError();
    const summary = this.toSummary({ ...request, rowVersion: request.rowVersion + 1, status });
    await this.audit.append(transaction, context, {
      action: `ARTIST_OVERTIME_${status}`,
      afterData: { ...summary, reviewComment: comment ?? null },
      beforeData: { rowVersion: request.rowVersion, status: request.status },
      objectId: request.id,
      objectType: 'ARTIST_OVERTIME',
      ...(comment ? { reason: comment } : {}),
      siteId: request.siteId,
    });
    return summary;
  }

  private toSummary(request: OvertimeRecord): OvertimeSummary {
    return {
      affectedAppointmentCount: request.affectedAppointmentCount,
      artistId: request.artistId,
      breakEndMinute: request.breakEndMinute,
      breakStartMinute: request.breakStartMinute,
      id: request.id,
      overtimeDate: formatDateOnly(request.overtimeDate),
      reason: request.reason,
      rowVersion: request.rowVersion,
      siteId: request.siteId,
      status: request.status as OvertimeSummary['status'],
      submittedAt: request.submittedAt.toISOString(),
      workEndMinute: request.workEndMinute,
      workStartMinute: request.workStartMinute,
    };
  }
}
