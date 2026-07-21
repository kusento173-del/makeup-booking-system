import type { Prisma } from '@makeup/database';
import { Injectable } from '@nestjs/common';

import { AuditEntryFactory } from '../audit/audit-entry.factory';
import { AuditLogRepository } from '../audit/audit-log.repository';
import type { AuditSnapshot } from '../audit/audit.types';
import { AuthorizationPolicyService } from '../auth/authorization-policy.service';
import { DatabaseService } from '../database/database.service';
import type {
  AssignOperatorCommand,
  CreateArtistCommand,
  CreateHostCommand,
  CreateOperatorCommand,
  CreateSiteCommand,
  MasterDataCommandContext,
} from './master-data-command.types';
import { MasterDataNormalizationService } from './master-data-normalization.service';

export class MasterDataNotFoundError extends Error {
  readonly code = 'MASTER_DATA_NOT_FOUND';

  constructor(entity: string) {
    super(`${entity} was not found`);
    this.name = 'MasterDataNotFoundError';
  }
}

export class MasterDataSiteMismatchError extends Error {
  readonly code = 'MASTER_DATA_SITE_MISMATCH';

  constructor() {
    super('Related master-data records must belong to the same site');
    this.name = 'MasterDataSiteMismatchError';
  }
}

function requiredText(value: string, field: string): string {
  const normalized = value.trim();

  if (!normalized) {
    throw new TypeError(`${field} must not be blank`);
  }

  return normalized;
}

function optionalText(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

@Injectable()
export class MasterDataCreateService {
  constructor(
    private readonly auditFactory: AuditEntryFactory,
    private readonly auditLogs: AuditLogRepository,
    private readonly authorization: AuthorizationPolicyService,
    private readonly database: DatabaseService,
    private readonly normalization: MasterDataNormalizationService,
  ) {}

  createSite(context: MasterDataCommandContext, command: CreateSiteCommand): Promise<string> {
    this.authorization.assertRole(context, ['ADMIN']);

    return this.database.transaction(async (transaction) => {
      const site = await transaction.site.create({
        data: {
          code: requiredText(command.code, 'code').toLocaleUpperCase('en-US'),
          name: requiredText(command.name, 'name'),
          sortOrder: command.sortOrder ?? 0,
          timezone: optionalText(command.timezone) ?? 'Asia/Shanghai',
        },
        select: { code: true, id: true, name: true, sortOrder: true, status: true, timezone: true },
      });

      await this.appendAudit(transaction, context, {
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
      const host = await transaction.hostProfile.create({
        data: {
          hostCode: requiredText(command.hostCode, 'hostCode'),
          nickname: optionalText(command.nickname) ?? null,
          realName: requiredText(command.realName, 'realName'),
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

      await this.appendAudit(transaction, context, {
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
    const nickname = requiredText(command.nickname, 'nickname');

    return this.database.transaction(async (transaction) => {
      const artist = await transaction.artistProfile.create({
        data: {
          nickname,
          nicknameNormalized: this.normalization.normalizeMatchText(nickname, 'nickname'),
          realName: requiredText(command.realName, 'realName'),
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

      await this.appendAudit(transaction, context, {
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
    const realName = requiredText(command.realName, 'realName');

    return this.database.transaction(async (transaction) => {
      const operator = await transaction.operatorProfile.create({
        data: {
          nameNormalized: this.normalization.normalizeMatchText(realName, 'realName'),
          realName,
          siteId: command.siteId,
        },
        select: { employmentStatus: true, id: true, realName: true, siteId: true },
      });

      await this.appendAudit(transaction, context, {
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
      const relation = await transaction.hostOperatorRelation.create({
        data: {
          changeReason: optionalText(command.changeReason) ?? null,
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

      await this.appendAudit(transaction, context, {
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

  private appendAudit(
    transaction: Prisma.TransactionClient,
    context: MasterDataCommandContext,
    entry: {
      readonly action: string;
      readonly afterData: AuditSnapshot;
      readonly objectId: string;
      readonly objectType: string;
      readonly reason?: string | undefined;
      readonly siteId: string;
    },
  ): Promise<string> {
    return this.auditLogs.append(
      transaction,
      this.auditFactory.create({
        ...entry,
        actorName: context.actorName,
        actorRole: context.roleCode,
        actorUserId: context.userId,
        clientType: context.clientType,
        ipAddress: context.ipAddress,
        requestId: context.requestId,
        userAgent: context.userAgent,
      }),
    );
  }
}
