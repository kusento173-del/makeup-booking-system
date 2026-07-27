import { apiRequest } from './api-client';

export interface SiteSummary {
  readonly code: string;
  readonly id: string;
  readonly name: string;
  readonly rowVersion: number;
  readonly sortOrder: number;
  readonly status: 'ACTIVE' | 'INACTIVE';
  readonly timezone: string;
}

export interface HostSummary {
  readonly accountBound: boolean;
  readonly hostCode: string;
  readonly id: string;
  readonly nickname: string | null;
  readonly qualificationStatus: 'ACTIVE' | 'SUSPENDED' | 'CANCELLED';
  readonly realName: string;
  readonly rowVersion: number;
  readonly siteId: string;
  readonly webAccountEnabled: boolean;
}

export interface ArtistSummary {
  readonly accountBound: boolean;
  readonly employmentStatus: 'ACTIVE' | 'INACTIVE';
  readonly id: string;
  readonly initialShiftConfigured: boolean;
  readonly nickname: string;
  readonly realName: string;
  readonly rowVersion: number;
  readonly siteId: string;
  readonly webAccountEnabled: boolean;
}

export interface OperatorSummary {
  readonly accountBound: boolean;
  readonly employmentStatus: 'ACTIVE' | 'INACTIVE';
  readonly id: string;
  readonly realName: string;
  readonly rowVersion: number;
  readonly siteId: string;
  readonly webAccountEnabled: boolean;
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

export function searchHosts(
  token: string,
  search: string,
  siteId: string,
): Promise<Page<HostSummary>> {
  const query = new URLSearchParams({ page: '1', pageSize: '20', search, siteId });
  return apiRequest(`/master-data/hosts?${query.toString()}`, { token });
}

export function createManagementItem(
  view: ManagementView,
  token: string,
  body: unknown,
): Promise<{ readonly id: string }> {
  const path = view === 'accounts' ? '/backoffice/accounts' : `/master-data/${view}`;
  return apiRequest(path, { body, method: 'POST', token });
}

export function updateManagementItem(
  view: Exclude<ManagementView, 'relations'>,
  token: string,
  id: string,
  body: unknown,
): Promise<void> {
  const path = view === 'accounts' ? `/backoffice/accounts/${id}` : `/master-data/${view}/${id}`;
  return apiRequest(path, { body, method: 'PATCH', token });
}

export function endRelation(
  token: string,
  id: string,
  body: {
    readonly expectedRowVersion: number;
    readonly reason: string;
    readonly validUntil: string;
  },
): Promise<void> {
  return apiRequest(`/master-data/host-operator-relations/${id}/end`, {
    body,
    method: 'PATCH',
    token,
  });
}

export function assignBackofficeRole(
  token: string,
  userId: string,
  body: { readonly roleCode: 'ADMIN' | 'CUSTOMER_SERVICE'; readonly siteId?: string },
): Promise<{ readonly id: string }> {
  return apiRequest(`/backoffice/accounts/${userId}/roles`, { body, method: 'POST', token });
}

export function revokeBackofficeRole(
  token: string,
  roleId: string,
  expectedRowVersion: number,
  reason: string,
): Promise<void> {
  return apiRequest(`/backoffice/roles/${roleId}/revoke`, {
    body: { expectedRowVersion, reason },
    method: 'PATCH',
    token,
  });
}

export interface IssuedBindingCode {
  readonly bindingCodeId: string;
  readonly code: string;
  readonly expiresAt: string;
  readonly profileId: string;
  readonly roleCode: 'HOST' | 'ARTIST' | 'OPERATOR';
  readonly siteId: string;
}

export function issueBindingCode(
  token: string,
  profileId: string,
  roleCode: IssuedBindingCode['roleCode'],
): Promise<IssuedBindingCode> {
  return apiRequest('/backoffice/binding-codes', {
    body: { profileId, roleCode },
    method: 'POST',
    token,
  });
}

export function provisionProfileAccount(
  token: string,
  body: {
    readonly loginName?: string;
    readonly profileId: string;
    readonly roleCode: 'ARTIST' | 'HOST' | 'OPERATOR';
    readonly temporaryPassword: string;
  },
): Promise<{ readonly loginName: string; readonly userId: string }> {
  return apiRequest('/backoffice/profile-accounts', { body, method: 'POST', token });
}

export function resetWebAccountPassword(
  token: string,
  profileId: string,
  roleCode: 'ARTIST' | 'HOST' | 'OPERATOR',
  temporaryPassword: string,
  reason: string,
): Promise<void> {
  return apiRequest('/backoffice/profile-accounts/password-reset', {
    body: { profileId, reason, roleCode, temporaryPassword },
    method: 'POST',
    token,
  });
}
