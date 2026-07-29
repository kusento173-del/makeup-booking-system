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

export interface FixedAvailability {
  readonly slots: readonly {
    readonly available: boolean;
    readonly earliestStartDate: string | null;
    readonly endMinute: number;
    readonly startMinute: number;
  }[];
  readonly unavailableReason: string | null;
}

export function listFixedRules(token: string, filters: FixedRuleFilters): Promise<FixedRulePage> {
  const query = new URLSearchParams({ page: String(filters.page), pageSize: '50' });
  if (filters.search) query.set('search', filters.search);
  if (filters.siteId) query.set('siteId', filters.siteId);
  if (filters.status) query.set('status', filters.status);
  return apiRequest(`/fixed-appointments/rules?${query.toString()}`, { token });
}

export function getFixedRuleAvailability(
  token: string,
  input: {
    readonly artistId: string;
    readonly currentRuleId?: string;
    readonly durationMinutes: number;
    readonly hostId: string;
    readonly requestedStartDate: string;
    readonly weekdays: readonly number[];
  },
): Promise<FixedAvailability> {
  const query = new URLSearchParams({
    artistId: input.artistId,
    durationMinutes: String(input.durationMinutes),
    hostId: input.hostId,
    requestedStartDate: input.requestedStartDate,
    weekdays: input.weekdays.join(','),
  });
  if (input.currentRuleId) query.set('currentRuleId', input.currentRuleId);
  return apiRequest(`/fixed-appointments/availability?${query.toString()}`, { token });
}

export function directlySetFixedRule(
  token: string,
  input:
    | {
        readonly currentRuleId: string;
        readonly effectiveFrom: string;
        readonly hostId: string;
        readonly reason: string;
        readonly requestType: 'CANCEL';
      }
    | {
        readonly artistId: string;
        readonly currentRuleId?: string;
        readonly durationMinutes: number;
        readonly effectiveFrom: string;
        readonly hostId: string;
        readonly reason: string;
        readonly requestType: 'CHANGE' | 'CREATE';
        readonly startMinute: number;
        readonly weekdays: readonly number[];
      },
): Promise<void> {
  return apiRequest('/fixed-appointments/rules/direct', {
    body: input,
    method: 'POST',
    token,
  });
}
