import type { RoleCode } from '../auth/authorization.types';

export type AuditActorRole = RoleCode | 'SYSTEM';
export type AuditJsonValue =
  boolean | number | string | null | readonly AuditJsonValue[] | AuditSnapshot;
export type AuditSnapshot = { readonly [key: string]: AuditJsonValue };

export interface CreateAuditEntryInput {
  readonly action: string;
  readonly actorName: string;
  readonly actorRole: AuditActorRole;
  readonly actorUserId?: string;
  readonly afterData?: AuditSnapshot;
  readonly beforeData?: AuditSnapshot;
  readonly clientType?: string;
  readonly ipAddress?: string;
  readonly objectId: string;
  readonly objectType: string;
  readonly reason?: string;
  readonly requestId?: string;
  readonly siteId?: string;
  readonly userAgent?: string;
}

export interface AuditEntryDraft {
  readonly action: string;
  readonly actorNameSnapshot: string;
  readonly actorRole: AuditActorRole;
  readonly actorUserId: string | null;
  readonly afterData: AuditSnapshot | null;
  readonly beforeData: AuditSnapshot | null;
  readonly clientType: string | null;
  readonly ipAddress: string | null;
  readonly objectId: string;
  readonly objectType: string;
  readonly reason: string | null;
  readonly requestId: string | null;
  readonly siteId: string | null;
  readonly userAgent: string | null;
}
