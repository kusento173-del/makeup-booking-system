import type { MasterDataCommandContext } from './master-data-command.types';

export type BackofficeRoleCode = 'ADMIN' | 'CUSTOMER_SERVICE';
export type AccountRoleCode = BackofficeRoleCode | 'HOST' | 'ARTIST' | 'OPERATOR';

export interface BackofficeRoleSummary {
  readonly id: string;
  readonly roleCode: AccountRoleCode;
  readonly rowVersion: number;
  readonly siteId: string | null;
}

export interface BackofficeAccountSummary {
  readonly displayName: string;
  readonly id: string;
  readonly loginName: string | null;
  readonly roles: readonly BackofficeRoleSummary[];
  readonly rowVersion: number;
  readonly status: 'ACTIVE' | 'DISABLED';
}

export interface BackofficeAccountPage {
  readonly items: readonly BackofficeAccountSummary[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
}

export interface BackofficeAccountPageInput {
  readonly page: number;
  readonly pageSize: number;
  readonly roleCode?: AccountRoleCode;
  readonly search?: string;
}

export interface CreateBackofficeAccountCommand {
  readonly displayName: string;
  readonly loginName: string;
  readonly password: string;
  readonly roleCode: BackofficeRoleCode;
  readonly siteId?: string;
}

export interface UpdateBackofficeAccountCommand {
  readonly displayName: string;
  readonly expectedRowVersion: number;
  readonly id: string;
  readonly reason: string;
  readonly status: 'ACTIVE' | 'DISABLED';
}

export interface AssignBackofficeRoleCommand {
  readonly roleCode: BackofficeRoleCode;
  readonly siteId?: string;
  readonly userId: string;
}

export interface RevokeBackofficeRoleCommand {
  readonly expectedRowVersion: number;
  readonly id: string;
  readonly reason: string;
}

export type BackofficeAccountContext = MasterDataCommandContext;
