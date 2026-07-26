import type { AuditJsonValue } from './audit.types';

export interface AuditQueryInput {
  readonly action?: string;
  readonly objectType?: string;
  readonly page: number;
  readonly pageSize: number;
  readonly siteId?: string;
}

export interface AuditLogItem {
  readonly action: string;
  readonly actorName: string;
  readonly actorRole: string;
  readonly afterData: AuditJsonValue | null;
  readonly beforeData: AuditJsonValue | null;
  readonly createdAt: string;
  readonly id: string;
  readonly objectId: string;
  readonly objectType: string;
  readonly reason: string | null;
  readonly siteId: string | null;
  readonly siteName: string | null;
}

export interface AuditLogPage {
  readonly items: readonly AuditLogItem[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
}
