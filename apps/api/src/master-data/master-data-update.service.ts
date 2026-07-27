import type { Prisma } from '@makeup/database';
import { Injectable } from '@nestjs/common';

import { AuditCommandService } from '../audit/audit-command.service';
import {
  AuthorizationDeniedError,
  AuthorizationPolicyService,
} from '../auth/authorization-policy.service';
import { normalizeBackofficeLoginName } from '../auth/backoffice-login-name';
import { DatabaseService } from '../database/database.service';
import type {
  EndOperatorAssignmentCommand,
  DeleteMasterDataRecordCommand,
  MasterDataCommandContext,
  UpdateArtistCommand,
  UpdateHostCommand,
  UpdateOperatorCommand,
  UpdateSiteCommand,
} from './master-data-command.types';
import {
  MasterDataDateRangeError,
  MasterDataInactiveSiteError,
  MasterDataNotFoundError,
  MasterDataVersionConflictError,
} from './master-data.errors';
import { MasterDataNormalizationService } from './master-data-normalization.service';
import { optionalMasterDataText, requiredMasterDataText } from './master-data-text';

function assertUpdated(count: number): void {
  if (count !== 1) {
    throw new MasterDataVersionConflictError();
  }
}

@Injectable()
export class MasterDataUpdateService {
  constructor(
    private readonly audit: AuditCommandService,
    private readonly authorization: AuthorizationPolicyService,
    private readonly database: DatabaseService,
    private readonly normalization: MasterDataNormalizationService,
  ) {}

  updateSite(context: MasterDataCommandContext, command: UpdateSiteCommand): Promise<void> {
    this.authorization.assertRole(context, ['ADMIN']);

    return this.database.transaction(async (transaction) => {
      const before = await transaction.site.findUnique({
        select: {
          code: true,
          id: true,
          name: true,
          rowVersion: true,
          sortOrder: true,
          status: true,
          timezone: true,
        },
        where: { id: command.id },
      });

      if (!before) {
        throw new MasterDataNotFoundError('Site');
      }

      const result = await transaction.site.updateMany({
        data: {
          name: requiredMasterDataText(command.name, 'name'),
          rowVersion: { increment: 1 },
          sortOrder: command.sortOrder,
          status: command.status,
          timezone: requiredMasterDataText(command.timezone, 'timezone'),
        },
        where: { id: command.id, rowVersion: command.expectedRowVersion },
      });
      assertUpdated(result.count);

      const after = await transaction.site.findUniqueOrThrow({
        select: {
          code: true,
          id: true,
          name: true,
          rowVersion: true,
          sortOrder: true,
          status: true,
          timezone: true,
        },
        where: { id: command.id },
      });

      await this.audit.append(transaction, context, {
        action: 'SITE_UPDATED',
        afterData: after,
        beforeData: before,
        objectId: before.id,
        objectType: 'SITE',
        reason: requiredMasterDataText(command.reason, 'reason'),
        siteId: before.id,
      });
    });
  }

  updateHost(context: MasterDataCommandContext, command: UpdateHostCommand): Promise<void> {
    const reason = requiredMasterDataText(command.reason, 'reason');
    const hostCode = requiredMasterDataText(command.hostCode, 'hostCode').toLocaleUpperCase(
      'en-US',
    );

    return this.database.transaction(async (transaction) => {
      const before = await transaction.hostProfile.findUnique({
        select: {
          hostCode: true,
          deletedAt: true,
          id: true,
          nickname: true,
          qualificationStatus: true,
          qualificationValidUntil: true,
          realName: true,
          rowVersion: true,
          siteId: true,
          userId: true,
        },
        where: { id: command.id },
      });

      if (!before) {
        throw new MasterDataNotFoundError('Host');
      }
      if (before.deletedAt) {
        throw new MasterDataNotFoundError('Host');
      }

      this.assertCurrentAndTargetSite(context, before.siteId, command.siteId);
      await this.assertActiveMoveTarget(transaction, before.siteId, command.siteId);
      const passwordIdentity =
        before.userId && before.hostCode !== hostCode
          ? await transaction.userIdentity.findFirst({
              select: { externalSubject: true, id: true },
              where: {
                provider: 'PASSWORD',
                providerAppId: 'BACKOFFICE',
                status: 'ACTIVE',
                userId: before.userId,
              },
            })
          : null;
      const syncedLoginName = passwordIdentity ? normalizeBackofficeLoginName(hostCode) : null;
      if (passwordIdentity && !syncedLoginName) {
        throw new MasterDataVersionConflictError();
      }
      const qualificationValidUntil = command.qualificationValidUntil ?? null;
      const qualificationChanged =
        before.qualificationStatus !== command.qualificationStatus ||
        before.qualificationValidUntil?.getTime() !== qualificationValidUntil?.getTime();
      const qualificationEffectiveAt = qualificationChanged ? new Date() : undefined;
      const result = await transaction.hostProfile.updateMany({
        data: {
          hostCode,
          nickname: optionalMasterDataText(command.nickname) ?? null,
          ...(qualificationEffectiveAt ? { qualificationEffectiveAt } : {}),
          qualificationStatus: command.qualificationStatus,
          qualificationValidUntil,
          realName: requiredMasterDataText(command.realName, 'realName'),
          rowVersion: { increment: 1 },
          siteId: command.siteId,
        },
        where: { id: command.id, rowVersion: command.expectedRowVersion },
      });
      assertUpdated(result.count);

      if (passwordIdentity && syncedLoginName) {
        await transaction.userIdentity.update({
          data: {
            externalSubject: syncedLoginName,
            rowVersion: { increment: 1 },
          },
          where: { id: passwordIdentity.id },
        });
      }

      if (qualificationEffectiveAt) {
        await transaction.hostQualificationHistory.create({
          data: {
            changedByUserId: context.userId,
            effectiveAt: qualificationEffectiveAt,
            fromStatus: before.qualificationStatus,
            hostId: before.id,
            reason,
            toStatus: command.qualificationStatus,
          },
        });
      }

      const after = await transaction.hostProfile.findUniqueOrThrow({
        select: {
          hostCode: true,
          id: true,
          nickname: true,
          qualificationStatus: true,
          qualificationValidUntil: true,
          realName: true,
          rowVersion: true,
          siteId: true,
          userId: true,
        },
        where: { id: command.id },
      });

      const beforeSnapshot = {
        hostCode: before.hostCode,
        id: before.id,
        nickname: before.nickname,
        qualificationStatus: before.qualificationStatus,
        qualificationValidUntil: before.qualificationValidUntil?.toISOString().slice(0, 10) ?? null,
        realName: before.realName,
        rowVersion: before.rowVersion,
        siteId: before.siteId,
      };
      const afterSnapshot = {
        hostCode: after.hostCode,
        id: after.id,
        nickname: after.nickname,
        qualificationStatus: after.qualificationStatus,
        qualificationValidUntil: after.qualificationValidUntil?.toISOString().slice(0, 10) ?? null,
        realName: after.realName,
        rowVersion: after.rowVersion,
        siteId: after.siteId,
      };
      await this.audit.append(transaction, context, {
        action: 'HOST_UPDATED',
        afterData: {
          ...afterSnapshot,
          ...(syncedLoginName ? { loginName: syncedLoginName } : {}),
        },
        beforeData: {
          ...beforeSnapshot,
          ...(passwordIdentity ? { loginName: passwordIdentity.externalSubject } : {}),
        },
        objectId: before.id,
        objectType: 'HOST',
        reason,
        siteId: after.siteId,
      });
    });
  }

  updateArtist(context: MasterDataCommandContext, command: UpdateArtistCommand): Promise<void> {
    const nickname = requiredMasterDataText(command.nickname, 'nickname');

    return this.database.transaction(async (transaction) => {
      const before = await transaction.artistProfile.findUnique({
        select: {
          employmentStatus: true,
          deletedAt: true,
          id: true,
          nickname: true,
          realName: true,
          rowVersion: true,
          siteId: true,
        },
        where: { id: command.id },
      });

      if (!before) {
        throw new MasterDataNotFoundError('Artist');
      }
      if (before.deletedAt) {
        throw new MasterDataNotFoundError('Artist');
      }

      this.assertCurrentAndTargetSite(context, before.siteId, command.siteId);
      await this.assertActiveMoveTarget(transaction, before.siteId, command.siteId);
      const result = await transaction.artistProfile.updateMany({
        data: {
          nickname,
          nicknameNormalized: this.normalization.normalizeMatchText(nickname, 'nickname'),
          realName: requiredMasterDataText(command.realName, 'realName'),
          rowVersion: { increment: 1 },
          siteId: command.siteId,
        },
        where: { id: command.id, rowVersion: command.expectedRowVersion },
      });
      assertUpdated(result.count);

      const after = await transaction.artistProfile.findUniqueOrThrow({
        select: {
          employmentStatus: true,
          deletedAt: true,
          id: true,
          nickname: true,
          realName: true,
          rowVersion: true,
          siteId: true,
        },
        where: { id: command.id },
      });

      await this.audit.append(transaction, context, {
        action: 'ARTIST_UPDATED',
        afterData: {
          ...after,
          deletedAt: after.deletedAt?.toISOString() ?? null,
        },
        beforeData: {
          ...before,
          deletedAt: null,
        },
        objectId: before.id,
        objectType: 'ARTIST',
        reason: requiredMasterDataText(command.reason, 'reason'),
        siteId: after.siteId,
      });
    });
  }

  updateOperator(context: MasterDataCommandContext, command: UpdateOperatorCommand): Promise<void> {
    const realName = requiredMasterDataText(command.realName, 'realName');

    return this.database.transaction(async (transaction) => {
      const before = await transaction.operatorProfile.findUnique({
        select: {
          employmentStatus: true,
          deletedAt: true,
          id: true,
          realName: true,
          rowVersion: true,
          siteId: true,
        },
        where: { id: command.id },
      });

      if (!before) {
        throw new MasterDataNotFoundError('Operator');
      }
      if (before.deletedAt) {
        throw new MasterDataNotFoundError('Operator');
      }

      this.assertCurrentAndTargetSite(context, before.siteId, command.siteId);
      await this.assertActiveMoveTarget(transaction, before.siteId, command.siteId);
      const result = await transaction.operatorProfile.updateMany({
        data: {
          nameNormalized: this.normalization.normalizeMatchText(realName, 'realName'),
          realName,
          rowVersion: { increment: 1 },
          siteId: command.siteId,
        },
        where: { id: command.id, rowVersion: command.expectedRowVersion },
      });
      assertUpdated(result.count);

      const after = await transaction.operatorProfile.findUniqueOrThrow({
        select: {
          employmentStatus: true,
          deletedAt: true,
          id: true,
          realName: true,
          rowVersion: true,
          siteId: true,
        },
        where: { id: command.id },
      });

      await this.audit.append(transaction, context, {
        action: 'OPERATOR_UPDATED',
        afterData: {
          ...after,
          deletedAt: after.deletedAt?.toISOString() ?? null,
        },
        beforeData: {
          ...before,
          deletedAt: null,
        },
        objectId: before.id,
        objectType: 'OPERATOR',
        reason: requiredMasterDataText(command.reason, 'reason'),
        siteId: after.siteId,
      });
    });
  }

  deleteHost(
    context: MasterDataCommandContext,
    command: DeleteMasterDataRecordCommand,
    now = new Date(),
  ): Promise<void> {
    return this.database.transaction(async (transaction) => {
      const before = await transaction.hostProfile.findUnique({
        select: {
          deletedAt: true,
          hostCode: true,
          id: true,
          qualificationStatus: true,
          rowVersion: true,
          siteId: true,
          userId: true,
        },
        where: { id: command.id },
      });
      if (!before || before.deletedAt) throw new MasterDataNotFoundError('Host');
      this.authorization.assertSiteScope(context, before.siteId);
      await this.assertLinkedUserCanBeDeleted(transaction, context, before.userId);

      const result = await transaction.hostProfile.updateMany({
        data: {
          deletedAt: now,
          qualificationEffectiveAt: now,
          qualificationStatus: 'CANCELLED',
          qualificationValidUntil: null,
          rowVersion: { increment: 1 },
        },
        where: { deletedAt: null, id: before.id, rowVersion: command.expectedRowVersion },
      });
      assertUpdated(result.count);
      const cancelledAppointments = await this.cancelFutureAppointments(
        transaction,
        context,
        { hostId: before.id },
        now,
        'HOST_DELETED',
        command.reason,
      );
      await transaction.fixedAppointmentRule.updateMany({
        data: { rowVersion: { increment: 1 }, status: 'CANCELLED' },
        where: { hostId: before.id, status: 'ACTIVE' },
      });
      await this.disableUser(transaction, before.userId, now);
      await this.audit.append(transaction, context, {
        action: 'HOST_DELETED',
        afterData: { cancelledAppointments, deletedAt: now.toISOString() },
        beforeData: {
          ...before,
          deletedAt: null,
        },
        objectId: before.id,
        objectType: 'HOST',
        reason: requiredMasterDataText(command.reason, 'reason'),
        siteId: before.siteId,
      });
    });
  }

  deleteArtist(
    context: MasterDataCommandContext,
    command: DeleteMasterDataRecordCommand,
    now = new Date(),
  ): Promise<void> {
    return this.database.transaction(async (transaction) => {
      const before = await transaction.artistProfile.findUnique({
        select: {
          deletedAt: true,
          id: true,
          nickname: true,
          rowVersion: true,
          siteId: true,
          userId: true,
        },
        where: { id: command.id },
      });
      if (!before || before.deletedAt) throw new MasterDataNotFoundError('Artist');
      this.authorization.assertSiteScope(context, before.siteId);
      await this.assertLinkedUserCanBeDeleted(transaction, context, before.userId);
      const result = await transaction.artistProfile.updateMany({
        data: {
          deletedAt: now,
          employmentStatus: 'INACTIVE',
          rowVersion: { increment: 1 },
        },
        where: { deletedAt: null, id: before.id, rowVersion: command.expectedRowVersion },
      });
      assertUpdated(result.count);
      const cancelledAppointments = await this.cancelFutureAppointments(
        transaction,
        context,
        { artistId: before.id },
        now,
        'ARTIST_DELETED',
        command.reason,
      );
      await transaction.fixedAppointmentRule.updateMany({
        data: { rowVersion: { increment: 1 }, status: 'CANCELLED' },
        where: { artistId: before.id, status: 'ACTIVE' },
      });
      await this.disableUser(transaction, before.userId, now);
      await this.audit.append(transaction, context, {
        action: 'ARTIST_DELETED',
        afterData: { cancelledAppointments, deletedAt: now.toISOString() },
        beforeData: {
          ...before,
          deletedAt: null,
        },
        objectId: before.id,
        objectType: 'ARTIST',
        reason: requiredMasterDataText(command.reason, 'reason'),
        siteId: before.siteId,
      });
    });
  }

  deleteOperator(
    context: MasterDataCommandContext,
    command: DeleteMasterDataRecordCommand,
    now = new Date(),
  ): Promise<void> {
    return this.database.transaction(async (transaction) => {
      const before = await transaction.operatorProfile.findUnique({
        select: {
          deletedAt: true,
          id: true,
          realName: true,
          rowVersion: true,
          siteId: true,
          userId: true,
        },
        where: { id: command.id },
      });
      if (!before || before.deletedAt) throw new MasterDataNotFoundError('Operator');
      this.authorization.assertSiteScope(context, before.siteId);
      await this.assertLinkedUserCanBeDeleted(transaction, context, before.userId);
      const result = await transaction.operatorProfile.updateMany({
        data: {
          deletedAt: now,
          employmentStatus: 'INACTIVE',
          rowVersion: { increment: 1 },
        },
        where: { deletedAt: null, id: before.id, rowVersion: command.expectedRowVersion },
      });
      assertUpdated(result.count);
      await this.disableUser(transaction, before.userId, now);
      await this.audit.append(transaction, context, {
        action: 'OPERATOR_DELETED',
        afterData: { deletedAt: now.toISOString() },
        beforeData: {
          ...before,
          deletedAt: null,
        },
        objectId: before.id,
        objectType: 'OPERATOR',
        reason: requiredMasterDataText(command.reason, 'reason'),
        siteId: before.siteId,
      });
    });
  }

  endOperatorAssignment(
    context: MasterDataCommandContext,
    command: EndOperatorAssignmentCommand,
  ): Promise<void> {
    return this.database.transaction(async (transaction) => {
      const before = await transaction.hostOperatorRelation.findUnique({
        select: {
          changeReason: true,
          host: { select: { siteId: true } },
          hostId: true,
          id: true,
          operatorId: true,
          rowVersion: true,
          validFrom: true,
          validUntil: true,
        },
        where: { id: command.id },
      });

      if (!before) {
        throw new MasterDataNotFoundError('Host operator relation');
      }

      this.authorization.assertSiteScope(context, before.host.siteId);

      if (command.validUntil <= before.validFrom) {
        throw new MasterDataDateRangeError();
      }

      const result = await transaction.hostOperatorRelation.updateMany({
        data: { rowVersion: { increment: 1 }, validUntil: command.validUntil },
        where: { id: command.id, rowVersion: command.expectedRowVersion },
      });
      assertUpdated(result.count);

      await this.audit.append(transaction, context, {
        action: 'HOST_OPERATOR_ENDED',
        afterData: this.relationSnapshot({
          ...before,
          rowVersion: before.rowVersion + 1,
          validUntil: command.validUntil,
        }),
        beforeData: this.relationSnapshot(before),
        objectId: before.id,
        objectType: 'HOST_OPERATOR_RELATION',
        reason: requiredMasterDataText(command.reason, 'reason'),
        siteId: before.host.siteId,
      });
    });
  }

  private assertCurrentAndTargetSite(
    context: MasterDataCommandContext,
    currentSiteId: string,
    targetSiteId: string,
  ): void {
    this.authorization.assertSiteScope(context, currentSiteId);
    this.authorization.assertSiteScope(context, targetSiteId);
  }

  private async cancelFutureAppointments(
    transaction: Prisma.TransactionClient,
    context: MasterDataCommandContext,
    target: { readonly artistId?: string; readonly hostId?: string },
    now: Date,
    reasonCode: string,
    reason: string,
  ): Promise<number> {
    const result = await transaction.appointment.updateMany({
      data: {
        cancellationReasonCode: reasonCode,
        cancellationReasonText: requiredMasterDataText(reason, 'reason'),
        cancelledAt: now,
        cancelledByUserId: context.userId,
        rowVersion: { increment: 1 },
        status: 'CANCELLED',
      },
      where: { ...target, startAt: { gt: now }, status: 'BOOKED' },
    });
    return result.count;
  }

  private async disableUser(
    transaction: Prisma.TransactionClient,
    userId: string | null,
    now: Date,
  ): Promise<void> {
    if (!userId) return;
    await Promise.all([
      transaction.appUser.updateMany({
        data: { rowVersion: { increment: 1 }, status: 'DISABLED' },
        where: { id: userId },
      }),
      transaction.authSession.updateMany({
        data: { revokedAt: now },
        where: { revokedAt: null, userId },
      }),
      transaction.userRole.updateMany({
        data: { revokedAt: now, rowVersion: { increment: 1 } },
        where: { revokedAt: null, userId },
      }),
    ]);
  }

  private async assertLinkedUserCanBeDeleted(
    transaction: Prisma.TransactionClient,
    context: MasterDataCommandContext,
    userId: string | null,
  ): Promise<void> {
    if (!userId) return;
    const protectedRole = await transaction.userRole.findFirst({
      select: { id: true },
      where: {
        revokedAt: null,
        roleCode: {
          in: context.roleCode === 'ADMIN' ? ['ADMIN'] : ['ADMIN', 'CUSTOMER_SERVICE'],
        },
        userId,
      },
    });
    if (protectedRole) throw new AuthorizationDeniedError();
  }

  private async assertActiveMoveTarget(
    transaction: Prisma.TransactionClient,
    currentSiteId: string,
    targetSiteId: string,
  ): Promise<void> {
    if (currentSiteId === targetSiteId) {
      return;
    }

    const target = await transaction.site.findUnique({
      select: { status: true },
      where: { id: targetSiteId },
    });

    if (!target) {
      throw new MasterDataNotFoundError('Site');
    }

    if (target.status !== 'ACTIVE') {
      throw new MasterDataInactiveSiteError();
    }
  }

  private relationSnapshot(relation: {
    readonly changeReason: string | null;
    readonly hostId: string;
    readonly operatorId: string;
    readonly rowVersion: number;
    readonly validFrom: Date;
    readonly validUntil: Date | null;
  }) {
    return {
      changeReason: relation.changeReason,
      hostId: relation.hostId,
      operatorId: relation.operatorId,
      rowVersion: relation.rowVersion,
      validFrom: relation.validFrom.toISOString().slice(0, 10),
      validUntil: relation.validUntil?.toISOString().slice(0, 10) ?? null,
    };
  }
}
