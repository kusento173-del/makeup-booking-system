import type { RoleCode, VerifiedAuthorizationContext } from './authorization.types';

export interface AccessTokenClaims extends VerifiedAuthorizationContext {
  readonly expiresAt: Date;
  readonly sessionId: string;
}

export interface SessionRole {
  readonly roleAssignmentId: string;
  readonly roleCode: RoleCode;
  readonly siteId: string | null;
}

export interface SessionTokenPair {
  readonly accessToken: string;
  readonly accessTokenExpiresAt: Date;
  readonly refreshToken: string;
  readonly refreshTokenExpiresAt: Date;
  readonly role: SessionRole;
  readonly sessionId: string;
  readonly userId: string;
}
