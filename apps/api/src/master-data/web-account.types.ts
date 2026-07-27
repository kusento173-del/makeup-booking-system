import type { MasterDataCommandContext } from './master-data-command.types';

export type ProfileAccountRoleCode = 'ARTIST' | 'HOST' | 'OPERATOR';

export interface ProvisionProfileAccountCommand {
  readonly loginName?: string;
  readonly profileId: string;
  readonly roleCode: ProfileAccountRoleCode;
  readonly temporaryPassword: string;
}

export interface ProvisionedProfileAccount {
  readonly loginName: string;
  readonly userId: string;
}

export interface ResetWebAccountPasswordCommand {
  readonly profileId: string;
  readonly reason: string;
  readonly roleCode: ProfileAccountRoleCode;
  readonly temporaryPassword: string;
}

export type WebAccountContext = MasterDataCommandContext;
