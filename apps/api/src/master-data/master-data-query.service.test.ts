import type { DatabaseClient } from '@makeup/database';
import { describe, expect, it, vi } from 'vitest';

import { AuthorizationDeniedError } from '../auth/authorization-policy.service';
import type { VerifiedAuthorizationContext } from '../auth/authorization.types';
import type { DatabaseService } from '../database/database.service';
import { MasterDataQueryService } from './master-data-query.service';

const asOf = new Date('2026-07-21T00:00:00.000Z');
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
    const service = createService({ hostProfile: { findMany } });

    await service.listHosts(baseContext, asOf);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { siteId: 'site-songjiang' } }),
    );
  });

  it('derives operator host scope from active database relations', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const service = createService({ hostProfile: { findMany } });
    const context = { ...baseContext, roleCode: 'OPERATOR', siteId: null } as const;

    await service.listHosts(context, asOf);

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
        },
      }),
    );
  });

  it('derives a host artist scope from the bound host profile', async () => {
    const findUnique = vi.fn().mockResolvedValue({ siteId: 'site-songjiang' });
    const findMany = vi.fn().mockResolvedValue([]);
    const service = createService({
      artistProfile: { findMany },
      hostProfile: { findUnique },
    });
    const context = { ...baseContext, roleCode: 'HOST', siteId: null } as const;

    await service.listArtists(context);

    expect(findUnique).toHaveBeenCalledWith({
      select: { siteId: true },
      where: { userId: 'user-1' },
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { siteId: 'site-songjiang' } }),
    );
  });

  it('denies host-list access to artists by default', async () => {
    const service = createService({ hostProfile: { findMany: vi.fn() } });
    const context = { ...baseContext, roleCode: 'ARTIST', siteId: null } as const;

    await expect(service.listHosts(context, asOf)).rejects.toBeInstanceOf(AuthorizationDeniedError);
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
});
