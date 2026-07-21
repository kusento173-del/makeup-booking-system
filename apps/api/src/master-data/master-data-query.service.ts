import type { DatabaseClient, Prisma } from '@makeup/database';
import { Injectable } from '@nestjs/common';

import { AuthorizationDeniedError } from '../auth/authorization-policy.service';
import type { VerifiedAuthorizationContext } from '../auth/authorization.types';
import { DatabaseService } from '../database/database.service';
import type {
  ArtistSummary,
  HostSummary,
  OperatorSummary,
  SiteSummary,
} from './master-data-query.types';

const HOST_SELECT = {
  hostCode: true,
  id: true,
  nickname: true,
  qualificationStatus: true,
  realName: true,
  siteId: true,
} satisfies Prisma.HostProfileSelect;

const ARTIST_SELECT = {
  employmentStatus: true,
  id: true,
  initialShiftConfiguredAt: true,
  nickname: true,
  siteId: true,
} satisfies Prisma.ArtistProfileSelect;

const OPERATOR_SELECT = {
  employmentStatus: true,
  id: true,
  realName: true,
  siteId: true,
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
          select: { code: true, id: true, name: true, status: true, timezone: true },
          where: context.roleCode === 'ADMIN' ? {} : { status: 'ACTIVE' },
        }) as Promise<SiteSummary[]>,
    );
  }

  listHosts(context: VerifiedAuthorizationContext, asOf: Date): Promise<HostSummary[]> {
    return this.database.read(async (client) => {
      const where = this.hostScope(context, asOf);
      return (await client.hostProfile.findMany({
        orderBy: [{ siteId: 'asc' }, { hostCode: 'asc' }],
        select: HOST_SELECT,
        where,
      })) as HostSummary[];
    });
  }

  listArtists(context: VerifiedAuthorizationContext): Promise<ArtistSummary[]> {
    return this.database.read(async (client) => {
      const where = await this.artistScope(client, context);
      const artists = await client.artistProfile.findMany({
        orderBy: [{ siteId: 'asc' }, { nickname: 'asc' }],
        select: ARTIST_SELECT,
        where,
      });

      return artists.map(({ initialShiftConfiguredAt, ...artist }) => ({
        ...artist,
        initialShiftConfigured: initialShiftConfiguredAt !== null,
      })) as ArtistSummary[];
    });
  }

  listOperators(context: VerifiedAuthorizationContext, asOf: Date): Promise<OperatorSummary[]> {
    return this.database.read(async (client) => {
      const where = this.operatorScope(context, asOf);
      return (await client.operatorProfile.findMany({
        orderBy: [{ siteId: 'asc' }, { realName: 'asc' }],
        select: OPERATOR_SELECT,
        where,
      })) as OperatorSummary[];
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
