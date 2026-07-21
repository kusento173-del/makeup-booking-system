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
  readonly afterData?: AuditSnapshot | undefined;
  readonly beforeData?: AuditSnapshot | undefined;
  readonly clientType?: string | undefined;
  readonly ipAddress?: string | undefined;
  readonly objectId: string;
  readonly objectType: string;
  readonly reason?: string | undefined;
  readonly requestId?: string | undefined;
  readonly siteId?: string | undefined;
  readonly userAgent?: string | undefined;
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
