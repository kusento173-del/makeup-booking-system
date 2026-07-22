import type {
  EmploymentStatus,
  HostQualificationStatus,
  SiteStatus,
} from './master-data.constants';

export interface SiteSummary {
  readonly code: string;
  readonly id: string;
  readonly name: string;
  readonly rowVersion: number;
  readonly status: SiteStatus;
  readonly timezone: string;
}

export interface HostSummary {
  readonly hostCode: string;
  readonly id: string;
  readonly nickname: string | null;
  readonly qualificationStatus: HostQualificationStatus;
  readonly realName: string;
  readonly rowVersion: number;
  readonly siteId: string;
}

export interface ArtistSummary {
  readonly employmentStatus: EmploymentStatus;
  readonly id: string;
  readonly initialShiftConfigured: boolean;
  readonly nickname: string;
  readonly realName: string;
  readonly rowVersion: number;
  readonly siteId: string;
}

export interface OperatorSummary {
  readonly employmentStatus: EmploymentStatus;
  readonly id: string;
  readonly realName: string;
  readonly rowVersion: number;
  readonly siteId: string;
}

export interface MasterDataPageInput {
  readonly page: number;
  readonly pageSize: number;
  readonly search?: string;
}

export interface MasterDataPage<T> {
  readonly items: readonly T[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
}
