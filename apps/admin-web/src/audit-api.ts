import { apiRequest } from './api-client';

export interface AuditLogItem {
  readonly action: string;
  readonly actorName: string;
  readonly actorRole: string;
  readonly afterData: unknown;
  readonly beforeData: unknown;
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

export function listAuditLogs(
  token: string,
  filters: {
    readonly action?: string;
    readonly objectType?: string;
    readonly page?: number;
    readonly pageSize?: number;
  } = {},
): Promise<AuditLogPage> {
  const query = new URLSearchParams({
    page: String(filters.page ?? 1),
    pageSize: String(filters.pageSize ?? 50),
  });
  if (filters.action) query.set('action', filters.action);
  if (filters.objectType) query.set('objectType', filters.objectType);
  return apiRequest(`/operation-logs?${query.toString()}`, { token });
}
