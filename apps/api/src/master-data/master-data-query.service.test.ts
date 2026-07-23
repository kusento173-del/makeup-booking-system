import type { DatabaseClient } from '@makeup/database';
import { describe, expect, it, vi } from 'vitest';

import { AuthorizationDeniedError } from '../auth/authorization-policy.service';
import type { VerifiedAuthorizationContext } from '../auth/authorization.types';
import type { DatabaseService } from '../database/database.service';
import { MasterDataQueryService } from './master-data-query.service';

const asOf = new Date('2026-07-21T00:00:00.000Z');
const page = { page: 1, pageSize: 50 };
const baseContext: VerifiedAuthorizationContext = {
  roleAssignmentId: 'role-1',
  roleCode: 'CUSTOMER_SERVICE',
  siteId: 'site-songjiang',
  userId: 'user-1',
};

function createService(client: object): MasterDataQueryService {
  const database = {
    read: vi.fn((operation: (value: DatabaseClient) => unknown) =>
      operation(client as DatabaseClient),
    ),
  };

  return new MasterDataQueryService(database as unknown as DatabaseService);
}

describe('MasterDataQueryService', () => {
  it('restricts customer-service host queries to the verified role site', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const service = createService({
      hostProfile: { count: vi.fn().mockResolvedValue(0), findMany },
    });

    await service.listHosts(baseContext, asOf, page);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { siteId: 'site-songjiang' } }),
    );
  });

  it('derives operator host scope from active database relations', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const service = createService({
      hostProfile: { count: vi.fn().mockResolvedValue(0), findMany },
    });
    const context = { ...baseContext, roleCode: 'OPERATOR', siteId: null } as const;

    await service.listHosts(context, asOf, page);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          operatorRelations: {
            some: {
              OR: [{ validUntil: null }, { validUntil: { gt: asOf } }],
              operator: { employmentStatus: 'ACTIVE', userId: 'user-1' },
              validFrom: { lte: asOf },
            },
          },
          qualificationStatus: 'ACTIVE',
        },
      }),
    );
  });

  it('derives a host artist scope from the bound host profile', async () => {
    const findUnique = vi.fn().mockResolvedValue({ siteId: 'site-songjiang' });
    const findMany = vi.fn().mockResolvedValue([]);
    const service = createService({
      artistProfile: { count: vi.fn().mockResolvedValue(0), findMany },
      hostProfile: { findUnique },
    });
    const context = { ...baseContext, roleCode: 'HOST', siteId: null } as const;

    await service.listArtists(context, page);

    expect(findUnique).toHaveBeenCalledWith({
      select: { siteId: true },
      where: { userId: 'user-1' },
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          employmentStatus: 'ACTIVE',
          initialShiftConfiguredAt: { not: null },
          siteId: 'site-songjiang',
        },
      }),
    );
  });

  it('denies host-list access to artists by default', async () => {
    const service = createService({
      hostProfile: { count: vi.fn(), findMany: vi.fn() },
    });
    const context = { ...baseContext, roleCode: 'ARTIST', siteId: null } as const;

    await expect(service.listHosts(context, asOf, page)).rejects.toBeInstanceOf(
      AuthorizationDeniedError,
    );
  });

  it('applies bounded pagination and search to host queries', async () => {
    const count = vi.fn().mockResolvedValue(101);
    const findMany = vi.fn().mockResolvedValue([]);
    const service = createService({ hostProfile: { count, findMany } });

    await expect(
      service.listHosts(baseContext, asOf, { page: 2, pageSize: 20, search: 'ZB01' }),
    ).resolves.toEqual({ items: [], page: 2, pageSize: 20, total: 101 });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 20,
        take: 20,
        where: {
          AND: [
            { siteId: 'site-songjiang' },
            {
              OR: [
                { hostCode: { contains: 'ZB01', mode: 'insensitive' } },
                { nickname: { contains: 'ZB01', mode: 'insensitive' } },
                { realName: { contains: 'ZB01', mode: 'insensitive' } },
              ],
            },
          ],
        },
      }),
    );
    expect(count).toHaveBeenCalledWith({
      where: {
        AND: [
          { siteId: 'site-songjiang' },
          {
            OR: [
              { hostCode: { contains: 'ZB01', mode: 'insensitive' } },
              { nickname: { contains: 'ZB01', mode: 'insensitive' } },
              { realName: { contains: 'ZB01', mode: 'insensitive' } },
            ],
          },
        ],
      },
    });
  });

  it('combines an admin site filter with the role scope instead of replacing it', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const service = createService({
      hostProfile: { count: vi.fn().mockResolvedValue(0), findMany },
    });
    const admin = { ...baseContext, roleCode: 'ADMIN', siteId: null } as const;

    await service.listHosts(admin, asOf, {
      page: 1,
      pageSize: 20,
      search: '小雨',
      siteId: 'site-songjiang',
    });

    const query = findMany.mock.calls[0]?.[0] as {
      where: { AND: readonly object[] };
    };
    expect(query.where.AND[0]).toEqual({});
    expect(query.where.AND[1]).toEqual({ siteId: 'site-songjiang' });
  });

  it('exposes only a binding flag instead of a host account identifier', async () => {
    const service = createService({
      hostProfile: {
        count: vi.fn().mockResolvedValue(1),
        findMany: vi.fn().mockResolvedValue([
          {
            hostCode: 'ZB0001',
            id: 'host-1',
            nickname: '小雨',
            qualificationStatus: 'ACTIVE',
            realName: '主播一',
            rowVersion: 1,
            siteId: 'site-songjiang',
            userId: 'private-user-id',
          },
        ]),
      },
    });

    const result = await service.listHosts(baseContext, asOf, page);

    expect(result.items[0]).toEqual({
      accountBound: true,
      hostCode: 'ZB0001',
      id: 'host-1',
      nickname: '小雨',
      qualificationStatus: 'ACTIVE',
      realName: '主播一',
      rowVersion: 1,
      siteId: 'site-songjiang',
    });
    expect(result.items[0]).not.toHaveProperty('userId');
  });

  it('shows inactive sites only to administrators', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const service = createService({ site: { findMany } });

    await service.listSites(baseContext);
    await service.listSites({ ...baseContext, roleCode: 'ADMIN', siteId: null });

    expect(findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ where: { status: 'ACTIVE' } }),
    );
    expect(findMany).toHaveBeenNthCalledWith(2, expect.objectContaining({ where: {} }));
  });

  it('limits relation management queries to the customer-service site', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const service = createService({
      hostOperatorRelation: { count: vi.fn().mockResolvedValue(0), findMany },
    });

    await service.listHostOperatorRelations(baseContext, page);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { host: { siteId: 'site-songjiang' } } }),
    );
  });

  it('denies relation management queries to non-backoffice roles', async () => {
    const service = createService({ hostOperatorRelation: {} });
    const context = { ...baseContext, roleCode: 'OPERATOR', siteId: null } as const;

    await expect(service.listHostOperatorRelations(context, page)).rejects.toBeInstanceOf(
      AuthorizationDeniedError,
    );
  });
});
