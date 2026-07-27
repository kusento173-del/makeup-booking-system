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

export interface UpdateSiteCommand {
  readonly expectedRowVersion: number;
  readonly id: string;
  readonly name: string;
  readonly reason: string;
  readonly sortOrder: number;
  readonly status: 'ACTIVE' | 'INACTIVE';
  readonly timezone: string;
}

export interface UpdateHostCommand {
  readonly expectedRowVersion: number;
  readonly hostCode: string;
  readonly id: string;
  readonly nickname?: string;
  readonly qualificationStatus: 'ACTIVE' | 'CANCELLED';
  readonly qualificationValidUntil?: Date;
  readonly realName: string;
  readonly reason: string;
  readonly siteId: string;
}

export interface UpdateArtistCommand {
  readonly expectedRowVersion: number;
  readonly id: string;
  readonly nickname: string;
  readonly realName: string;
  readonly reason: string;
  readonly siteId: string;
}

export interface UpdateOperatorCommand {
  readonly expectedRowVersion: number;
  readonly id: string;
  readonly realName: string;
  readonly reason: string;
  readonly siteId: string;
}

export interface DeleteMasterDataRecordCommand {
  readonly expectedRowVersion: number;
  readonly id: string;
  readonly reason: string;
}

export interface EndOperatorAssignmentCommand {
  readonly expectedRowVersion: number;
  readonly id: string;
  readonly reason: string;
  readonly validUntil: Date;
}
