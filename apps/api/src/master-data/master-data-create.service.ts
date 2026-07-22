import type { Prisma } from '@makeup/database';
import { Injectable } from '@nestjs/common';

import { AuthorizationPolicyService } from '../auth/authorization-policy.service';
import { DatabaseService } from '../database/database.service';
import { MasterDataAuditService } from './master-data-audit.service';
import type {
  AssignOperatorCommand,
  CreateArtistCommand,
  CreateHostCommand,
  CreateOperatorCommand,
  CreateSiteCommand,
  MasterDataCommandContext,
} from './master-data-command.types';
import {
  MasterDataInactiveSiteError,
  MasterDataNotFoundError,
  MasterDataSiteMismatchError,
} from './master-data.errors';
import { MasterDataNormalizationService } from './master-data-normalization.service';
import { optionalMasterDataText, requiredMasterDataText } from './master-data-text';

@Injectable()
export class MasterDataCreateService {
  constructor(
    private readonly audit: MasterDataAuditService,
    private readonly authorization: AuthorizationPolicyService,
    private readonly database: DatabaseService,
    private readonly normalization: MasterDataNormalizationService,
  ) {}

  createSite(context: MasterDataCommandContext, command: CreateSiteCommand): Promise<string> {
    this.authorization.assertRole(context, ['ADMIN']);

    return this.database.transaction(async (transaction) => {
      const site = await transaction.site.create({
        data: {
          code: requiredMasterDataText(command.code, 'code').toLocaleUpperCase('en-US'),
          name: requiredMasterDataText(command.name, 'name'),
          sortOrder: command.sortOrder ?? 0,
          timezone: optionalMasterDataText(command.timezone) ?? 'Asia/Shanghai',
        },
        select: { code: true, id: true, name: true, sortOrder: true, status: true, timezone: true },
      });

      await this.audit.append(transaction, context, {
        action: 'SITE_CREATED',
        afterData: site,
        objectId: site.id,
        objectType: 'SITE',
        siteId: site.id,
      });

      return site.id;
    });
  }

  createHost(context: MasterDataCommandContext, command: CreateHostCommand): Promise<string> {
    this.authorization.assertSiteScope(context, command.siteId);

    return this.database.transaction(async (transaction) => {
      await this.assertActiveSite(transaction, command.siteId);
      const host = await transaction.hostProfile.create({
        data: {
          hostCode: requiredMasterDataText(command.hostCode, 'hostCode'),
          nickname: optionalMasterDataText(command.nickname) ?? null,
          realName: requiredMasterDataText(command.realName, 'realName'),
          siteId: command.siteId,
        },
        select: {
          hostCode: true,
          id: true,
          nickname: true,
          qualificationStatus: true,
          realName: true,
          siteId: true,
        },
      });

      await this.audit.append(transaction, context, {
        action: 'HOST_CREATED',
        afterData: host,
        objectId: host.id,
        objectType: 'HOST',
        siteId: host.siteId,
      });

      return host.id;
    });
  }

  createArtist(context: MasterDataCommandContext, command: CreateArtistCommand): Promise<string> {
    this.authorization.assertSiteScope(context, command.siteId);
    const nickname = requiredMasterDataText(command.nickname, 'nickname');

    return this.database.transaction(async (transaction) => {
      await this.assertActiveSite(transaction, command.siteId);
      const artist = await transaction.artistProfile.create({
        data: {
          nickname,
          nicknameNormalized: this.normalization.normalizeMatchText(nickname, 'nickname'),
          realName: requiredMasterDataText(command.realName, 'realName'),
          siteId: command.siteId,
        },
        select: {
          employmentStatus: true,
          id: true,
          nickname: true,
          realName: true,
          siteId: true,
        },
      });

      await this.audit.append(transaction, context, {
        action: 'ARTIST_CREATED',
        afterData: artist,
        objectId: artist.id,
        objectType: 'ARTIST',
        siteId: artist.siteId,
      });

      return artist.id;
    });
  }

  createOperator(
    context: MasterDataCommandContext,
    command: CreateOperatorCommand,
  ): Promise<string> {
    this.authorization.assertSiteScope(context, command.siteId);
    const realName = requiredMasterDataText(command.realName, 'realName');

    return this.database.transaction(async (transaction) => {
      await this.assertActiveSite(transaction, command.siteId);
      const operator = await transaction.operatorProfile.create({
        data: {
          nameNormalized: this.normalization.normalizeMatchText(realName, 'realName'),
          realName,
          siteId: command.siteId,
        },
        select: { employmentStatus: true, id: true, realName: true, siteId: true },
      });

      await this.audit.append(transaction, context, {
        action: 'OPERATOR_CREATED',
        afterData: operator,
        objectId: operator.id,
        objectType: 'OPERATOR',
        siteId: operator.siteId,
      });

      return operator.id;
    });
  }

  assignOperator(
    context: MasterDataCommandContext,
    command: AssignOperatorCommand,
  ): Promise<string> {
    return this.database.transaction(async (transaction) => {
      const [host, operator] = await Promise.all([
        transaction.hostProfile.findUnique({
          select: { hostCode: true, id: true, siteId: true },
          where: { id: command.hostId },
        }),
        transaction.operatorProfile.findUnique({
          select: { employmentStatus: true, id: true, realName: true, siteId: true },
          where: { id: command.operatorId },
        }),
      ]);

      if (!host) {
        throw new MasterDataNotFoundError('Host');
      }

      if (!operator) {
        throw new MasterDataNotFoundError('Operator');
      }

      if (host.siteId !== operator.siteId) {
        throw new MasterDataSiteMismatchError();
      }

      this.authorization.assertSiteScope(context, host.siteId);
      await this.assertActiveSite(transaction, host.siteId);
      const relation = await transaction.hostOperatorRelation.create({
        data: {
          changeReason: optionalMasterDataText(command.changeReason) ?? null,
          hostId: host.id,
          operatorId: operator.id,
          validFrom: command.validFrom,
          validUntil: command.validUntil ?? null,
        },
        select: {
          changeReason: true,
          hostId: true,
          id: true,
          operatorId: true,
          validFrom: true,
          validUntil: true,
        },
      });

      await this.audit.append(transaction, context, {
        action: 'HOST_OPERATOR_ASSIGNED',
        afterData: {
          changeReason: relation.changeReason,
          hostId: relation.hostId,
          operatorId: relation.operatorId,
          validFrom: relation.validFrom.toISOString().slice(0, 10),
          validUntil: relation.validUntil?.toISOString().slice(0, 10) ?? null,
        },
        objectId: relation.id,
        objectType: 'HOST_OPERATOR_RELATION',
        reason: relation.changeReason ?? undefined,
        siteId: host.siteId,
      });

      return relation.id;
    });
  }

  private async assertActiveSite(
    transaction: Prisma.TransactionClient,
    siteId: string,
  ): Promise<void> {
    const site = await transaction.site.findUnique({
      select: { status: true },
      where: { id: siteId },
    });

    if (!site) {
      throw new MasterDataNotFoundError('Site');
    }

    if (site.status !== 'ACTIVE') {
      throw new MasterDataInactiveSiteError();
    }
  }
}
