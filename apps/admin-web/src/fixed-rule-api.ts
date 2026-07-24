import { apiRequest } from './api-client';

export type FixedRuleStatus = 'ACTIVE' | 'ENDED';

export interface FixedRule {
  readonly artistId: string;
  readonly artistNickname: string;
  readonly durationMinutes: number;
  readonly hostCode: string;
  readonly hostId: string;
  readonly hostName: string;
  readonly id: string;
  readonly siteId: string;
  readonly siteName: string;
  readonly startMinute: number;
  readonly status: FixedRuleStatus;
  readonly validFrom: string;
  readonly validUntil: string | null;
  readonly weekdays: readonly number[];
}

export interface FixedRulePage {
  readonly items: readonly FixedRule[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
}

export interface FixedRuleFilters {
  readonly page: number;
  readonly search?: string;
  readonly siteId?: string;
  readonly status?: FixedRuleStatus;
}

export function listFixedRules(token: string, filters: FixedRuleFilters): Promise<FixedRulePage> {
  const query = new URLSearchParams({ page: String(filters.page), pageSize: '50' });
  if (filters.search) query.set('search', filters.search);
  if (filters.siteId) query.set('siteId', filters.siteId);
  if (filters.status) query.set('status', filters.status);
  return apiRequest(`/fixed-appointments/rules?${query.toString()}`, { token });
}
