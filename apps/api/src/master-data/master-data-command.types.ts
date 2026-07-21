import type { VerifiedAuthorizationContext } from '../auth/authorization.types';

export interface MasterDataCommandContext extends VerifiedAuthorizationContext {
  readonly actorName: string;
  readonly clientType?: string;
  readonly ipAddress?: string;
  readonly requestId?: string;
  readonly userAgent?: string;
}

export interface CreateSiteCommand {
  readonly code: string;
  readonly name: string;
  readonly sortOrder?: number;
  readonly timezone?: string;
}

export interface CreateHostCommand {
  readonly hostCode: string;
  readonly nickname?: string;
  readonly realName: string;
  readonly siteId: string;
}

export interface CreateArtistCommand {
  readonly nickname: string;
  readonly realName: string;
  readonly siteId: string;
}

export interface CreateOperatorCommand {
  readonly realName: string;
  readonly siteId: string;
}

export interface AssignOperatorCommand {
  readonly changeReason?: string;
  readonly hostId: string;
  readonly operatorId: string;
  readonly validFrom: Date;
  readonly validUntil?: Date;
}
