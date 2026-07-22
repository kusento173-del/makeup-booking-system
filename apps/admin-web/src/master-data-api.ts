import { apiRequest } from './api-client';

export interface SiteSummary {
  readonly code: string;
  readonly id: string;
  readonly name: string;
  readonly rowVersion: number;
  readonly status: 'ACTIVE' | 'INACTIVE';
  readonly timezone: string;
}

export interface HostSummary {
  readonly hostCode: string;
  readonly id: string;
  readonly nickname: string | null;
  readonly qualificationStatus: 'ACTIVE' | 'SUSPENDED' | 'CANCELLED';
  readonly realName: string;
  readonly rowVersion: number;
  readonly siteId: string;
}

export interface ArtistSummary {
  readonly employmentStatus: 'ACTIVE' | 'INACTIVE';
  readonly id: string;
  readonly initialShiftConfigured: boolean;
  readonly nickname: string;
  readonly realName: string;
  readonly rowVersion: number;
  readonly siteId: string;
}

export interface OperatorSummary {
  readonly employmentStatus: 'ACTIVE' | 'INACTIVE';
  readonly id: string;
  readonly realName: string;
  readonly rowVersion: number;
  readonly siteId: string;
}

export interface RelationSummary {
  readonly changeReason: string | null;
  readonly hostCode: string;
  readonly hostId: string;
  readonly hostName: string;
  readonly id: string;
  readonly operatorId: string;
  readonly operatorName: string;
  readonly rowVersion: number;
  readonly siteId: string;
  readonly validFrom: string;
  readonly validUntil: string | null;
}

export interface BackofficeRoleSummary {
  readonly id: string;
  readonly roleCode: 'ADMIN' | 'CUSTOMER_SERVICE';
  readonly rowVersion: number;
  readonly siteId: string | null;
}

export interface AccountSummary {
  readonly displayName: string;
  readonly id: string;
  readonly loginName: string | null;
  readonly roles: readonly BackofficeRoleSummary[];
  readonly rowVersion: number;
  readonly status: 'ACTIVE' | 'DISABLED';
}

export interface Page<T> {
  readonly items: readonly T[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
}

export type ManagementView = 'sites' | 'hosts' | 'artists' | 'operators' | 'relations' | 'accounts';
export type ManagementItem =
  SiteSummary | HostSummary | ArtistSummary | OperatorSummary | RelationSummary | AccountSummary;

const PATHS: Record<Exclude<ManagementView, 'sites'>, string> = {
  accounts: '/backoffice/accounts',
  artists: '/master-data/artists',
  hosts: '/master-data/hosts',
  operators: '/master-data/operators',
  relations: '/master-data/host-operator-relations',
};

export function listSites(token: string): Promise<readonly SiteSummary[]> {
  return apiRequest('/master-data/sites', { token });
}

export function listManagementItems(
  view: Exclude<ManagementView, 'sites'>,
  token: string,
  page: number,
  search?: string,
): Promise<Page<ManagementItem>> {
  const query = new URLSearchParams({ page: String(page), pageSize: '50' });
  if (search) {
    query.set('search', search);
  }
  return apiRequest(`${PATHS[view]}?${query.toString()}`, { token });
}
