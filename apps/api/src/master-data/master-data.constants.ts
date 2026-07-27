export const SITE_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export const EMPLOYMENT_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export const HOST_QUALIFICATION_STATUSES = ['ACTIVE', 'CANCELLED'] as const;
export const PERSONNEL_STATUSES = ['ACTIVE', 'DELETED'] as const;

export type SiteStatus = (typeof SITE_STATUSES)[number];
export type EmploymentStatus = (typeof EMPLOYMENT_STATUSES)[number];
export type HostQualificationStatus = (typeof HOST_QUALIFICATION_STATUSES)[number];
export type PersonnelStatus = (typeof PERSONNEL_STATUSES)[number];
