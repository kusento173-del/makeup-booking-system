import type { Prisma } from '@makeup/database';
import { Injectable } from '@nestjs/common';

import { AuthorizationPolicyService } from '../auth/authorization-policy.service';
import { DatabaseService } from '../database/database.service';
import { MasterDataAuditService } from './master-data-audit.service';
import type {
  EndOperatorAssignmentCommand,
  MasterDataCommandContext,
  UpdateArtistCommand,
  UpdateHostCommand,
  UpdateOperatorCommand,
  UpdateSiteCommand,
} from './master-data-command.types';
import {
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
    private readonly audit: MasterDataAuditService,
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
    return this.database.transaction(async (transaction) => {
      const before = await transaction.hostProfile.findUnique({
        select: {
          hostCode: true,
          id: true,
          nickname: true,
          qualificationStatus: true,
          realName: true,
          rowVersion: true,
          siteId: true,
        },
        where: { id: command.id },
      });

      if (!before) {
        throw new MasterDataNotFoundError('Host');
      }

      this.assertCurrentAndTargetSite(context, before.siteId, command.siteId);
      await this.assertActiveMoveTarget(transaction, before.siteId, command.siteId);
      const result = await transaction.hostProfile.updateMany({
        data: {
          nickname: optionalMasterDataText(command.nickname) ?? null,
          ...(before.qualificationStatus === command.qualificationStatus
            ? {}
            : { qualificationEffectiveAt: new Date() }),
          qualificationStatus: command.qualificationStatus,
          realName: requiredMasterDataText(command.realName, 'realName'),
          rowVersion: { increment: 1 },
          siteId: command.siteId,
        },
        where: { id: command.id, rowVersion: command.expectedRowVersion },
      });
      assertUpdated(result.count);

      const after = await transaction.hostProfile.findUniqueOrThrow({
        select: {
          hostCode: true,
          id: true,
          nickname: true,
          qualificationStatus: true,
          realName: true,
          rowVersion: true,
          siteId: true,
        },
        where: { id: command.id },
      });

      await this.audit.append(transaction, context, {
        action: 'HOST_UPDATED',
        afterData: after,
        beforeData: before,
        objectId: before.id,
        objectType: 'HOST',
        reason: requiredMasterDataText(command.reason, 'reason'),
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

      this.assertCurrentAndTargetSite(context, before.siteId, command.siteId);
      await this.assertActiveMoveTarget(transaction, before.siteId, command.siteId);
      const result = await transaction.artistProfile.updateMany({
        data: {
          employmentStatus: command.employmentStatus,
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
        afterData: after,
        beforeData: before,
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

      this.assertCurrentAndTargetSite(context, before.siteId, command.siteId);
      await this.assertActiveMoveTarget(transaction, before.siteId, command.siteId);
      const result = await transaction.operatorProfile.updateMany({
        data: {
          employmentStatus: command.employmentStatus,
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
          id: true,
          realName: true,
          rowVersion: true,
          siteId: true,
        },
        where: { id: command.id },
      });

      await this.audit.append(transaction, context, {
        action: 'OPERATOR_UPDATED',
        afterData: after,
        beforeData: before,
        objectId: before.id,
        objectType: 'OPERATOR',
        reason: requiredMasterDataText(command.reason, 'reason'),
        siteId: after.siteId,
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
        throw new RangeError('validUntil must be later than validFrom');
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
