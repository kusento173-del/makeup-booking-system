import type { DatabaseClient, Prisma } from '@makeup/database';
import { Injectable } from '@nestjs/common';

import { AuthorizationDeniedError } from '../auth/authorization-policy.service';
import type { VerifiedAuthorizationContext } from '../auth/authorization.types';
import { DatabaseService } from '../database/database.service';
import { effectiveHostQualification } from './host-qualification';
import type {
  ArtistSummary,
  HostSummary,
  HostOperatorRelationSummary,
  MasterDataPage,
  MasterDataPageInput,
  OperatorSummary,
  SiteSummary,
} from './master-data-query.types';

const HOST_SELECT = {
  deletedAt: true,
  hostCode: true,
  id: true,
  nickname: true,
  qualificationStatus: true,
  qualificationValidUntil: true,
  realName: true,
  rowVersion: true,
  siteId: true,
  user: { select: { passwordCredential: { select: { userId: true } } } },
  userId: true,
} satisfies Prisma.HostProfileSelect;

const ARTIST_SELECT = {
  deletedAt: true,
  employmentStatus: true,
  id: true,
  initialShiftConfiguredAt: true,
  nickname: true,
  realName: true,
  rowVersion: true,
  siteId: true,
  user: { select: { passwordCredential: { select: { userId: true } } } },
  userId: true,
} satisfies Prisma.ArtistProfileSelect;

const OPERATOR_SELECT = {
  deletedAt: true,
  employmentStatus: true,
  id: true,
  realName: true,
  rowVersion: true,
  siteId: true,
  user: { select: { passwordCredential: { select: { userId: true } } } },
  userId: true,
} satisfies Prisma.OperatorProfileSelect;

function requireSiteId(siteId: string | null): string {
  if (!siteId) {
    throw new AuthorizationDeniedError();
  }

  return siteId;
}

function activeRelationAt(asOf: Date): Prisma.HostOperatorRelationWhereInput {
  return {
    OR: [{ validUntil: null }, { validUntil: { gt: asOf } }],
    validFrom: { lte: asOf },
  };
}

@Injectable()
export class MasterDataQueryService {
  constructor(private readonly database: DatabaseService) {}

  listSites(context: VerifiedAuthorizationContext): Promise<SiteSummary[]> {
    return this.database.read(
      (client) =>
        client.site.findMany({
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          select: {
            code: true,
            id: true,
            name: true,
            rowVersion: true,
            sortOrder: true,
            status: true,
            timezone: true,
          },
          where: context.roleCode === 'ADMIN' ? {} : { status: 'ACTIVE' },
        }) as Promise<SiteSummary[]>,
    );
  }

  listHosts(
    context: VerifiedAuthorizationContext,
    asOf: Date,
    input: MasterDataPageInput,
  ): Promise<MasterDataPage<HostSummary>> {
    return this.database.read(async (client) => {
      const scope = this.hostScope(context, asOf);
      const filters: Prisma.HostProfileWhereInput[] = [scope];
      if (input.siteId) filters.push({ siteId: input.siteId });
      if (input.personnelStatus) {
        filters.push({
          deletedAt: input.personnelStatus === 'ACTIVE' ? null : { not: null },
        });
      }
      if (input.qualificationStatus) {
        filters.push(
          input.qualificationStatus === 'ACTIVE'
            ? {
                OR: [
                  { qualificationStatus: 'ACTIVE' },
                  {
                    qualificationStatus: 'CANCELLED',
                    qualificationValidUntil: { lt: asOf },
                  },
                ],
              }
            : {
                qualificationStatus: 'CANCELLED',
                OR: [{ qualificationValidUntil: null }, { qualificationValidUntil: { gte: asOf } }],
              },
        );
      }
      if (input.search) {
        filters.push({
          OR: [
            { hostCode: { contains: input.search, mode: 'insensitive' } },
            { nickname: { contains: input.search, mode: 'insensitive' } },
            { realName: { contains: input.search, mode: 'insensitive' } },
          ],
        });
      }
      const where: Prisma.HostProfileWhereInput = filters.length === 1 ? scope : { AND: filters };
      const [items, total] = await Promise.all([
        client.hostProfile.findMany({
          orderBy: [{ siteId: 'asc' }, { hostCode: 'asc' }],
          select: HOST_SELECT,
          skip: (input.page - 1) * input.pageSize,
          take: input.pageSize,
          where,
        }),
        client.hostProfile.count({ where }),
      ]);

      return {
        items: items.map(({ deletedAt, qualificationValidUntil, user, userId, ...host }) => ({
          ...host,
          accountBound: userId !== null,
          personnelStatus: deletedAt ? 'DELETED' : 'ACTIVE',
          qualificationStatus: deletedAt
            ? 'CANCELLED'
            : effectiveHostQualification(
                { qualificationStatus: host.qualificationStatus, qualificationValidUntil },
                asOf,
              ),
          qualificationValidUntil: qualificationValidUntil?.toISOString().slice(0, 10) ?? null,
          webAccountEnabled: Boolean(user?.passwordCredential),
        })),
        page: input.page,
        pageSize: input.pageSize,
        total,
      };
    });
  }

  listArtists(
    context: VerifiedAuthorizationContext,
    input: MasterDataPageInput,
  ): Promise<MasterDataPage<ArtistSummary>> {
    return this.database.read(async (client) => {
      const scope = await this.artistScope(client, context);
      const filters: Prisma.ArtistProfileWhereInput[] = [scope];
      if (input.personnelStatus) {
        filters.push({
          deletedAt: input.personnelStatus === 'ACTIVE' ? null : { not: null },
        });
      }
      if (input.search) {
        filters.push({
          OR: [
            { nickname: { contains: input.search, mode: 'insensitive' } },
            { realName: { contains: input.search, mode: 'insensitive' } },
          ],
        });
      }
      const where: Prisma.ArtistProfileWhereInput = filters.length === 1 ? scope : { AND: filters };
      const [artists, total] = await Promise.all([
        client.artistProfile.findMany({
          orderBy: [{ siteId: 'asc' }, { nickname: 'asc' }],
          select: ARTIST_SELECT,
          skip: (input.page - 1) * input.pageSize,
          take: input.pageSize,
          where,
        }),
        client.artistProfile.count({ where }),
      ]);

      return {
        items: artists.map(({ deletedAt, initialShiftConfiguredAt, user, userId, ...artist }) => ({
          ...artist,
          accountBound: userId !== null,
          initialShiftConfigured: initialShiftConfiguredAt !== null,
          personnelStatus: deletedAt ? 'DELETED' : 'ACTIVE',
          webAccountEnabled: Boolean(user?.passwordCredential),
        })) as ArtistSummary[],
        page: input.page,
        pageSize: input.pageSize,
        total,
      };
    });
  }

  listOperators(
    context: VerifiedAuthorizationContext,
    asOf: Date,
    input: MasterDataPageInput,
  ): Promise<MasterDataPage<OperatorSummary>> {
    return this.database.read(async (client) => {
      const scope = this.operatorScope(context, asOf);
      const filters: Prisma.OperatorProfileWhereInput[] = [scope];
      if (input.personnelStatus) {
        filters.push({
          deletedAt: input.personnelStatus === 'ACTIVE' ? null : { not: null },
        });
      }
      if (input.search) {
        filters.push({ realName: { contains: input.search, mode: 'insensitive' } });
      }
      const where: Prisma.OperatorProfileWhereInput =
        filters.length === 1 ? scope : { AND: filters };
      const [items, total] = await Promise.all([
        client.operatorProfile.findMany({
          orderBy: [{ siteId: 'asc' }, { realName: 'asc' }],
          select: OPERATOR_SELECT,
          skip: (input.page - 1) * input.pageSize,
          take: input.pageSize,
          where,
        }),
        client.operatorProfile.count({ where }),
      ]);

      return {
        items: items.map(({ deletedAt, user, userId, ...operator }) => ({
          ...operator,
          accountBound: userId !== null,
          personnelStatus: deletedAt ? 'DELETED' : 'ACTIVE',
          webAccountEnabled: Boolean(user?.passwordCredential),
        })) as OperatorSummary[],
        page: input.page,
        pageSize: input.pageSize,
        total,
      };
    });
  }

  listHostOperatorRelations(
    context: VerifiedAuthorizationContext,
    input: MasterDataPageInput,
  ): Promise<MasterDataPage<HostOperatorRelationSummary>> {
    return this.database.read(async (client) => {
      const scope = this.relationScope(context);
      const where: Prisma.HostOperatorRelationWhereInput = input.search
        ? {
            AND: [
              scope,
              {
                OR: [
                  { host: { hostCode: { contains: input.search, mode: 'insensitive' } } },
                  { host: { nickname: { contains: input.search, mode: 'insensitive' } } },
                  { host: { realName: { contains: input.search, mode: 'insensitive' } } },
                  { operator: { realName: { contains: input.search, mode: 'insensitive' } } },
                ],
              },
            ],
          }
        : scope;
      const [relations, total] = await Promise.all([
        client.hostOperatorRelation.findMany({
          orderBy: [{ validFrom: 'desc' }, { createdAt: 'desc' }],
          select: {
            changeReason: true,
            host: {
              select: { hostCode: true, id: true, nickname: true, realName: true, siteId: true },
            },
            id: true,
            operator: { select: { id: true, realName: true } },
            rowVersion: true,
            validFrom: true,
            validUntil: true,
          },
          skip: (input.page - 1) * input.pageSize,
          take: input.pageSize,
          where,
        }),
        client.hostOperatorRelation.count({ where }),
      ]);

      return {
        items: relations.map((relation) => ({
          changeReason: relation.changeReason,
          hostCode: relation.host.hostCode,
          hostId: relation.host.id,
          hostName: relation.host.nickname ?? relation.host.realName,
          id: relation.id,
          operatorId: relation.operator.id,
          operatorName: relation.operator.realName,
          rowVersion: relation.rowVersion,
          siteId: relation.host.siteId,
          validFrom: relation.validFrom.toISOString().slice(0, 10),
          validUntil: relation.validUntil?.toISOString().slice(0, 10) ?? null,
        })),
        page: input.page,
        pageSize: input.pageSize,
        total,
      };
    });
  }

  private hostScope(
    context: VerifiedAuthorizationContext,
    asOf: Date,
  ): Prisma.HostProfileWhereInput {
    switch (context.roleCode) {
      case 'ADMIN':
        return {};
      case 'CUSTOMER_SERVICE':
        return { siteId: requireSiteId(context.siteId) };
      case 'HOST':
        return { userId: context.userId };
      case 'OPERATOR':
        return {
          operatorRelations: {
            some: {
              ...activeRelationAt(asOf),
              operator: { employmentStatus: 'ACTIVE', userId: context.userId },
            },
          },
        };
      case 'ARTIST':
        throw new AuthorizationDeniedError();
    }
  }

  private async artistScope(
    client: DatabaseClient,
    context: VerifiedAuthorizationContext,
  ): Promise<Prisma.ArtistProfileWhereInput> {
    switch (context.roleCode) {
      case 'ADMIN':
        return {};
      case 'CUSTOMER_SERVICE':
        return { siteId: requireSiteId(context.siteId) };
      case 'ARTIST':
        return { userId: context.userId };
      case 'HOST':
        return { siteId: await this.findHostSite(client, context.userId) };
      case 'OPERATOR':
        return { siteId: await this.findOperatorSite(client, context.userId) };
    }
  }

  private operatorScope(
    context: VerifiedAuthorizationContext,
    asOf: Date,
  ): Prisma.OperatorProfileWhereInput {
    switch (context.roleCode) {
      case 'ADMIN':
        return {};
      case 'CUSTOMER_SERVICE':
        return { siteId: requireSiteId(context.siteId) };
      case 'OPERATOR':
        return { userId: context.userId };
      case 'HOST':
        return {
          hostRelations: {
            some: {
              ...activeRelationAt(asOf),
              host: { userId: context.userId },
            },
          },
        };
      case 'ARTIST':
        throw new AuthorizationDeniedError();
    }
  }

  private relationScope(
    context: VerifiedAuthorizationContext,
  ): Prisma.HostOperatorRelationWhereInput {
    switch (context.roleCode) {
      case 'ADMIN':
        return {};
      case 'CUSTOMER_SERVICE':
        return { host: { siteId: requireSiteId(context.siteId) } };
      case 'ARTIST':
      case 'HOST':
      case 'OPERATOR':
        throw new AuthorizationDeniedError();
    }
  }

  private async findHostSite(client: DatabaseClient, userId: string): Promise<string> {
    const record = await client.hostProfile.findUnique({
      select: { siteId: true },
      where: { userId },
    });

    if (!record) {
      throw new AuthorizationDeniedError();
    }

    return record.siteId;
  }

  private async findOperatorSite(client: DatabaseClient, userId: string): Promise<string> {
    const record = await client.operatorProfile.findUnique({
      select: { siteId: true },
      where: { userId },
    });

    if (!record) {
      throw new AuthorizationDeniedError();
    }

    return record.siteId;
  }
}
