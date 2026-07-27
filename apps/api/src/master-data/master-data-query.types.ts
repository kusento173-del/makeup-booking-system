import type {
  EmploymentStatus,
  HostQualificationStatus,
  PersonnelStatus,
  SiteStatus,
} from './master-data.constants';

export interface SiteSummary {
  readonly code: string;
  readonly id: string;
  readonly name: string;
  readonly rowVersion: number;
  readonly sortOrder: number;
  readonly status: SiteStatus;
  readonly timezone: string;
}

export interface HostSummary {
  readonly accountBound: boolean;
  readonly hostCode: string;
  readonly id: string;
  readonly nickname: string | null;
  readonly qualificationStatus: HostQualificationStatus;
  readonly qualificationValidUntil: string | null;
  readonly personnelStatus: PersonnelStatus;
  readonly realName: string;
  readonly rowVersion: number;
  readonly siteId: string;
  readonly webAccountEnabled: boolean;
}

export interface ArtistSummary {
  readonly accountBound: boolean;
  readonly employmentStatus: EmploymentStatus;
  readonly personnelStatus: PersonnelStatus;
  readonly id: string;
  readonly initialShiftConfigured: boolean;
  readonly nickname: string;
  readonly realName: string;
  readonly rowVersion: number;
  readonly siteId: string;
  readonly webAccountEnabled: boolean;
}

export interface OperatorSummary {
  readonly accountBound: boolean;
  readonly employmentStatus: EmploymentStatus;
  readonly personnelStatus: PersonnelStatus;
  readonly id: string;
  readonly realName: string;
  readonly rowVersion: number;
  readonly siteId: string;
  readonly webAccountEnabled: boolean;
}

export interface HostOperatorRelationSummary {
  readonly changeReason: string | null;
  readonly hostCode: string;
  readonly hostId: string;
  readonly hostName: string;
  readonly id: string;
  readonly operatorId: string;
  readonly operatorName: string;
  readonly rowVersion: number;
  readonly siteId: string;
  readonly validFrom: string;
  readonly validUntil: string | null;
}

export interface MasterDataPageInput {
  readonly page: number;
  readonly pageSize: number;
  readonly search?: string;
  readonly siteId?: string;
  readonly personnelStatus?: PersonnelStatus;
  readonly qualificationStatus?: HostQualificationStatus;
}

export interface MasterDataPage<T> {
  readonly items: readonly T[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
}
