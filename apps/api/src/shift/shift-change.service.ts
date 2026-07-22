import { Prisma } from '@makeup/database';
import { Injectable } from '@nestjs/common';

import { AuditCommandService } from '../audit/audit-command.service';
import {
  AuthorizationDeniedError,
  AuthorizationPolicyService,
} from '../auth/authorization-policy.service';
import type { VerifiedAuthorizationContext } from '../auth/authorization.types';
import { DatabaseService } from '../database/database.service';
import { formatDateOnly, toBusinessDate } from './business-date';
import {
  ShiftArtistNotFoundError,
  ShiftArtistUnavailableError,
  ShiftChangeEffectiveDateError,
  ShiftChangeNoOpError,
  ShiftChangeNotFoundError,
  ShiftChangePendingExistsError,
  ShiftChangeReasonInvalidError,
  ShiftChangeStateConflictError,
} from './shift.errors';
import { validateShiftDefinition } from './shift-time';
import type {
  ArtistShiftSummary,
  DirectShiftChangeCommand,
  ReviewShiftChangeCommand,
  ShiftChangeListItem,
  ShiftChangePage,
  ShiftChangePageInput,
  ShiftChangeSummary,
  ShiftCommandContext,
  SubmitShiftChangeCommand,
  WithdrawShiftChangeCommand,
} from './shift.types';
import type { ShiftDefinition } from './shift-time';

const CURRENT_SHIFT_SELECT = {
  artistId: true,
  breakEndMinute: true,
  breakStartMinute: true,
  id: true,
  validFrom: true,
  validUntil: true,
  versionNo: true,
  workEndMinute: true,
  workStartMinute: true,
  workdays: true,
} satisfies Prisma.ArtistShiftTemplateSelect;

const CHANGE_SELECT = {
  artistId: true,
  effectiveFrom: true,
  id: true,
  proposedBreakEndMinute: true,
  proposedBreakStartMinute: true,
  proposedWorkEndMinute: true,
  proposedWorkStartMinute: true,
  proposedWorkdays: true,
  reason: true,
  rowVersion: true,
  siteId: true,
  status: true,
  submittedAt: true,
} satisfies Prisma.ArtistShiftChangeRequestSelect;

const REVIEW_SELECT = {
  ...CHANGE_SELECT,
  affectedAppointmentCount: true,
  artist: { select: { employmentStatus: true, siteId: true } },
  currentShift: { select: CURRENT_SHIFT_SELECT },
  submittedByUserId: true,
} satisfies Prisma.ArtistShiftChangeRequestSelect;

const LIST_SELECT = {
  ...CHANGE_SELECT,
  artist: { select: { nickname: true } },
  reviewComment: true,
  reviewedAt: true,
} satisfies Prisma.ArtistShiftChangeRequestSelect;

type CurrentShiftRecord = Prisma.ArtistShiftTemplateGetPayload<{
  select: typeof CURRENT_SHIFT_SELECT;
}>;
type ChangeRecord = Prisma.ArtistShiftChangeRequestGetPayload<{ select: typeof CHANGE_SELECT }>;
type ReviewRecord = Prisma.ArtistShiftChangeRequestGetPayload<{ select: typeof REVIEW_SELECT }>;
type ListRecord = Prisma.ArtistShiftChangeRequestGetPayload<{ select: typeof LIST_SELECT }>;

function normalizedRequiredText(value: string): string {
  const result = value.normalize('NFKC').trim();
  if (!result || result.length > 500) {
    throw new ShiftChangeReasonInvalidError();
  }
  return result;
}

function normalizedOptionalText(value: string | undefined): string | undefined {
  return value === undefined ? undefined : normalizedRequiredText(value);
}

function nextBusinessDate(now: Date): Date {
  const date = toBusinessDate(now);
  date.setUTCDate(date.getUTCDate() + 1);
  return date;
}

function assertDateOnly(value: Date): void {
  if (
    Number.isNaN(value.getTime()) ||
    value.getUTCHours() !== 0 ||
    value.getUTCMinutes() !== 0 ||
    value.getUTCSeconds() !== 0 ||
    value.getUTCMilliseconds() !== 0
  ) {
    throw new ShiftChangeEffectiveDateError();
  }
}

@Injectable()
export class ShiftChangeService {
  constructor(
    private readonly audit: AuditCommandService,
    private readonly authorization: AuthorizationPolicyService,
    private readonly database: DatabaseService,
  ) {}

  directChange(
    context: ShiftCommandContext,
    command: DirectShiftChangeCommand,
    now = new Date(),
  ): Promise<ArtistShiftSummary> {
    this.authorization.assertRole(context, ['CUSTOMER_SERVICE', 'ADMIN']);
    validateShiftDefinition(command);
    assertDateOnly(command.effectiveFrom);
    if (command.effectiveFrom < nextBusinessDate(now)) {
      throw new ShiftChangeEffectiveDateError();
    }
    const reason = normalizedRequiredText(command.reason);

    return this.database.transaction(async (transaction) => {
      const artist = await transaction.artistProfile.findUnique({
        select: { employmentStatus: true, id: true, siteId: true },
        where: { id: command.artistId },
      });
      if (!artist) {
        throw new ShiftArtistNotFoundError();
      }
      this.authorization.assertSiteScope(context, artist.siteId);
      if (artist.employmentStatus !== 'ACTIVE') {
        throw new ShiftArtistUnavailableError();
      }

      const currentShift = await transaction.artistShiftTemplate.findFirst({
        orderBy: { versionNo: 'desc' },
        select: CURRENT_SHIFT_SELECT,
        where: { artistId: artist.id, validUntil: null },
      });
      if (
        !currentShift ||
        currentShift.versionNo !== command.expectedVersionNo ||
        command.effectiveFrom <= currentShift.validFrom
      ) {
        throw new ShiftChangeStateConflictError();
      }
      this.assertChanged(currentShift, command);
      return this.replaceCurrentShift(transaction, context, currentShift, command, {
        action: 'ARTIST_SHIFT_DIRECTLY_CHANGED',
        effectiveFrom: command.effectiveFrom,
        reason,
        siteId: artist.siteId,
      });
    });
  }

  list(
    context: VerifiedAuthorizationContext,
    input: ShiftChangePageInput,
  ): Promise<ShiftChangePage> {
    const where = this.listScope(context, input.status);

    return this.database.read(async (client) => {
      const [items, total] = await Promise.all([
        client.artistShiftChangeRequest.findMany({
          orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }],
          select: LIST_SELECT,
          skip: (input.page - 1) * input.pageSize,
          take: input.pageSize,
          where,
        }),
        client.artistShiftChangeRequest.count({ where }),
      ]);
      return {
        items: items.map((item) => this.toListItem(item)),
        page: input.page,
        pageSize: input.pageSize,
        total,
      };
    });
  }

  submit(
    context: ShiftCommandContext,
    command: SubmitShiftChangeCommand,
    now = new Date(),
  ): Promise<ShiftChangeSummary> {
    this.authorization.assertRole(context, ['ARTIST']);
    validateShiftDefinition(command);
    assertDateOnly(command.effectiveFrom);
    if (command.effectiveFrom < nextBusinessDate(now)) {
      throw new ShiftChangeEffectiveDateError();
    }
    const reason = normalizedRequiredText(command.reason);

    return this.database.transaction(async (transaction) => {
      const artist = await transaction.artistProfile.findUnique({
        select: { employmentStatus: true, id: true, siteId: true, userId: true },
        where: { id: command.artistId },
      });
      if (!artist) {
        throw new ShiftArtistNotFoundError();
      }
      if (artist.userId !== context.userId) {
        throw new AuthorizationDeniedError();
      }
      if (artist.employmentStatus !== 'ACTIVE') {
        throw new ShiftArtistUnavailableError();
      }

      const currentShift = await transaction.artistShiftTemplate.findFirst({
        orderBy: { versionNo: 'desc' },
        select: CURRENT_SHIFT_SELECT,
        where: { artistId: artist.id, validUntil: null },
      });
      if (!currentShift || command.effectiveFrom <= currentShift.validFrom) {
        throw new ShiftChangeStateConflictError();
      }
      this.assertChanged(currentShift, command);

      try {
        const request = await transaction.artistShiftChangeRequest.create({
          data: {
            artistId: artist.id,
            currentShiftId: currentShift.id,
            effectiveFrom: command.effectiveFrom,
            proposedBreakEndMinute: command.breakEndMinute,
            proposedBreakStartMinute: command.breakStartMinute,
            proposedWorkEndMinute: command.workEndMinute,
            proposedWorkStartMinute: command.workStartMinute,
            proposedWorkdays: [...command.workdays].sort((left, right) => left - right),
            reason,
            siteId: artist.siteId,
            submittedByUserId: context.userId,
          },
          select: CHANGE_SELECT,
        });
        const summary = this.toSummary(request);
        await this.audit.append(transaction, context, {
          action: 'ARTIST_SHIFT_CHANGE_SUBMITTED',
          afterData: { ...summary },
          objectId: request.id,
          objectType: 'ARTIST_SHIFT_CHANGE_REQUEST',
          reason,
          siteId: artist.siteId,
        });
        return summary;
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new ShiftChangePendingExistsError();
        }
        throw error;
      }
    });
  }

  withdraw(context: ShiftCommandContext, command: WithdrawShiftChangeCommand): Promise<void> {
    this.authorization.assertRole(context, ['ARTIST']);

    return this.database.transaction(async (transaction) => {
      const request = await transaction.artistShiftChangeRequest.findUnique({
        select: CHANGE_SELECT,
        where: { id: command.requestId },
      });
      if (!request) {
        throw new ShiftChangeNotFoundError();
      }
      const artist = await transaction.artistProfile.findUnique({
        select: { userId: true },
        where: { id: request.artistId },
      });
      if (artist?.userId !== context.userId) {
        throw new AuthorizationDeniedError();
      }

      const updated = await transaction.artistShiftChangeRequest.updateMany({
        data: { rowVersion: { increment: 1 }, status: 'WITHDRAWN' },
        where: {
          id: request.id,
          rowVersion: command.expectedRowVersion,
          status: 'PENDING',
        },
      });
      if (updated.count !== 1) {
        throw new ShiftChangeStateConflictError();
      }
      await this.audit.append(transaction, context, {
        action: 'ARTIST_SHIFT_CHANGE_WITHDRAWN',
        afterData: { rowVersion: command.expectedRowVersion + 1, status: 'WITHDRAWN' },
        beforeData: { rowVersion: request.rowVersion, status: request.status },
        objectId: request.id,
        objectType: 'ARTIST_SHIFT_CHANGE_REQUEST',
        siteId: request.siteId,
      });
    });
  }

  review(
    context: ShiftCommandContext,
    command: ReviewShiftChangeCommand,
    now = new Date(),
  ): Promise<ArtistShiftSummary | null> {
    this.authorization.assertRole(context, ['CUSTOMER_SERVICE', 'ADMIN']);
    const comment = normalizedOptionalText(command.comment);

    return this.database.transaction(async (transaction) => {
      const request = await transaction.artistShiftChangeRequest.findUnique({
        select: REVIEW_SELECT,
        where: { id: command.requestId },
      });
      if (!request) {
        throw new ShiftChangeNotFoundError();
      }
      this.authorization.assertSiteScope(context, request.siteId);
      if (request.submittedByUserId === context.userId) {
        throw new AuthorizationDeniedError();
      }
      if (
        request.status !== 'PENDING' ||
        request.rowVersion !== command.expectedRowVersion ||
        request.artist.siteId !== request.siteId ||
        request.artist.employmentStatus !== 'ACTIVE'
      ) {
        throw new ShiftChangeStateConflictError();
      }

      if (command.decision === 'APPROVE') {
        assertDateOnly(request.effectiveFrom);
        if (request.effectiveFrom < nextBusinessDate(now)) {
          throw new ShiftChangeEffectiveDateError();
        }
        return this.approve(transaction, context, request, comment, now);
      }

      await this.finishReview(transaction, request, context, 'REJECTED', comment, now);
      return null;
    });
  }

  private async approve(
    transaction: Prisma.TransactionClient,
    context: ShiftCommandContext,
    request: ReviewRecord,
    comment: string | undefined,
    now: Date,
  ): Promise<ArtistShiftSummary> {
    if (request.currentShift.validUntil !== null || request.affectedAppointmentCount !== 0) {
      throw new ShiftChangeStateConflictError();
    }
    await this.finishReview(transaction, request, context, 'APPROVED', comment, now);
    return this.replaceCurrentShift(
      transaction,
      context,
      request.currentShift,
      {
        breakEndMinute: request.proposedBreakEndMinute,
        breakStartMinute: request.proposedBreakStartMinute,
        workEndMinute: request.proposedWorkEndMinute,
        workStartMinute: request.proposedWorkStartMinute,
        workdays: request.proposedWorkdays,
      },
      {
        action: 'ARTIST_SHIFT_VERSION_CREATED',
        effectiveFrom: request.effectiveFrom,
        ...(comment ? { reason: comment } : {}),
        siteId: request.siteId,
        sourceRequestId: request.id,
      },
    );
  }

  private async replaceCurrentShift(
    transaction: Prisma.TransactionClient,
    context: ShiftCommandContext,
    currentShift: CurrentShiftRecord,
    proposed: ShiftDefinition,
    options: {
      readonly action: string;
      readonly effectiveFrom: Date;
      readonly reason?: string;
      readonly siteId: string;
      readonly sourceRequestId?: string;
    },
  ): Promise<ArtistShiftSummary> {
    const closed = await transaction.artistShiftTemplate.updateMany({
      data: { validUntil: options.effectiveFrom },
      where: { id: currentShift.id, validUntil: null },
    });
    if (closed.count !== 1) {
      throw new ShiftChangeStateConflictError();
    }
    const shift = await transaction.artistShiftTemplate.create({
      data: {
        artistId: currentShift.artistId,
        breakEndMinute: proposed.breakEndMinute,
        breakStartMinute: proposed.breakStartMinute,
        createdByUserId: context.userId,
        ...(options.sourceRequestId ? { sourceRequestId: options.sourceRequestId } : {}),
        validFrom: options.effectiveFrom,
        versionNo: currentShift.versionNo + 1,
        workEndMinute: proposed.workEndMinute,
        workStartMinute: proposed.workStartMinute,
        workdays: [...proposed.workdays].sort((left, right) => left - right),
      },
      select: CURRENT_SHIFT_SELECT,
    });
    const summary = this.toShiftSummary(shift, options.siteId);
    await this.audit.append(transaction, context, {
      action: options.action,
      afterData: { ...summary },
      beforeData: { ...this.toShiftSummary(currentShift, options.siteId) },
      objectId: shift.id,
      objectType: 'ARTIST_SHIFT_TEMPLATE',
      ...(options.reason ? { reason: options.reason } : {}),
      siteId: options.siteId,
    });
    return summary;
  }

  private async finishReview(
    transaction: Prisma.TransactionClient,
    request: ReviewRecord,
    context: ShiftCommandContext,
    status: 'APPROVED' | 'REJECTED',
    comment: string | undefined,
    now: Date,
  ): Promise<void> {
    const updated = await transaction.artistShiftChangeRequest.updateMany({
      data: {
        reviewComment: comment ?? null,
        reviewedAt: now,
        reviewedByUserId: context.userId,
        rowVersion: { increment: 1 },
        status,
      },
      where: { id: request.id, rowVersion: request.rowVersion, status: 'PENDING' },
    });
    if (updated.count !== 1) {
      throw new ShiftChangeStateConflictError();
    }
    await this.audit.append(transaction, context, {
      action: `ARTIST_SHIFT_CHANGE_${status}`,
      afterData: { reviewComment: comment ?? null, rowVersion: request.rowVersion + 1, status },
      beforeData: { rowVersion: request.rowVersion, status: request.status },
      objectId: request.id,
      objectType: 'ARTIST_SHIFT_CHANGE_REQUEST',
      reason: comment,
      siteId: request.siteId,
    });
  }

  private assertChanged(current: CurrentShiftRecord, proposed: ShiftDefinition): void {
    const currentDays = [...current.workdays].sort((left, right) => left - right);
    const proposedDays = [...proposed.workdays].sort((left, right) => left - right);
    if (
      current.breakEndMinute === proposed.breakEndMinute &&
      current.breakStartMinute === proposed.breakStartMinute &&
      current.workEndMinute === proposed.workEndMinute &&
      current.workStartMinute === proposed.workStartMinute &&
      currentDays.join(',') === proposedDays.join(',')
    ) {
      throw new ShiftChangeNoOpError();
    }
  }

  private listScope(
    context: VerifiedAuthorizationContext,
    status: ShiftChangePageInput['status'],
  ): Prisma.ArtistShiftChangeRequestWhereInput {
    const statusFilter = status ? { status } : {};
    switch (context.roleCode) {
      case 'ARTIST':
        return { ...statusFilter, artist: { userId: context.userId } };
      case 'CUSTOMER_SERVICE':
        if (!context.siteId) {
          throw new AuthorizationDeniedError();
        }
        return { ...statusFilter, siteId: context.siteId };
      case 'ADMIN':
        return statusFilter;
      case 'HOST':
      case 'OPERATOR':
        throw new AuthorizationDeniedError();
    }
  }

  private toSummary(request: ChangeRecord): ShiftChangeSummary {
    return {
      artistId: request.artistId,
      breakEndMinute: request.proposedBreakEndMinute,
      breakStartMinute: request.proposedBreakStartMinute,
      effectiveFrom: formatDateOnly(request.effectiveFrom),
      id: request.id,
      reason: request.reason,
      rowVersion: request.rowVersion,
      siteId: request.siteId,
      status: request.status as ShiftChangeSummary['status'],
      submittedAt: request.submittedAt.toISOString(),
      workEndMinute: request.proposedWorkEndMinute,
      workStartMinute: request.proposedWorkStartMinute,
      workdays: request.proposedWorkdays,
    };
  }

  private toListItem(request: ListRecord): ShiftChangeListItem {
    return {
      ...this.toSummary(request),
      artistNickname: request.artist.nickname,
      reviewComment: request.reviewComment,
      reviewedAt: request.reviewedAt?.toISOString() ?? null,
    };
  }

  private toShiftSummary(shift: CurrentShiftRecord, siteId: string): ArtistShiftSummary {
    return {
      artistId: shift.artistId,
      breakEndMinute: shift.breakEndMinute,
      breakStartMinute: shift.breakStartMinute,
      id: shift.id,
      siteId,
      validFrom: formatDateOnly(shift.validFrom),
      validUntil: shift.validUntil ? formatDateOnly(shift.validUntil) : null,
      versionNo: shift.versionNo,
      workEndMinute: shift.workEndMinute,
      workStartMinute: shift.workStartMinute,
      workdays: shift.workdays,
    };
  }
}
