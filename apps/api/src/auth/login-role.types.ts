import type { RoleCode } from './authorization.types';

export interface LoginRole {
  readonly roleAssignmentId: string;
  readonly roleCode: RoleCode;
  readonly siteId: string | null;
}
