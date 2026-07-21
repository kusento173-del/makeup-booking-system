export const ROLE_CODES = ['HOST', 'OPERATOR', 'ARTIST', 'CUSTOMER_SERVICE', 'ADMIN'] as const;

export type RoleCode = (typeof ROLE_CODES)[number];

export interface VerifiedAuthorizationContext {
  readonly roleAssignmentId: string;
  readonly roleCode: RoleCode;
  readonly siteId: string | null;
  readonly userId: string;
}
