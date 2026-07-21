import type {
  EmploymentStatus,
  HostQualificationStatus,
  SiteStatus,
} from './master-data.constants';

export interface SiteSummary {
  readonly code: string;
  readonly id: string;
  readonly name: string;
  readonly status: SiteStatus;
  readonly timezone: string;
}

export interface HostSummary {
  readonly hostCode: string;
  readonly id: string;
  readonly nickname: string | null;
  readonly qualificationStatus: HostQualificationStatus;
  readonly realName: string;
  readonly siteId: string;
}

export interface ArtistSummary {
  readonly employmentStatus: EmploymentStatus;
  readonly id: string;
  readonly initialShiftConfigured: boolean;
  readonly nickname: string;
  readonly siteId: string;
}

export interface OperatorSummary {
  readonly employmentStatus: EmploymentStatus;
  readonly id: string;
  readonly realName: string;
  readonly siteId: string;
}
