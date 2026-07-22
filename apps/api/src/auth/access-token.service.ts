import { Injectable } from '@nestjs/common';
import { jwtVerify, SignJWT } from 'jose';

import { isRoleCode } from './auth-role.mapper';
import { AuthConfigurationError, AuthSessionInvalidError } from './auth-session.errors';
import type { AccessTokenClaims, SessionRole } from './auth-session.types';

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const DEFAULT_ISSUER = 'makeup-booking-api';
const DEFAULT_AUDIENCE = 'makeup-booking-clients';

@Injectable()
export class AccessTokenService {
  async issue(
    userId: string,
    sessionId: string,
    role: SessionRole,
    now = new Date(),
  ): Promise<{ readonly expiresAt: Date; readonly token: string }> {
    const config = this.config();
    const issuedAt = Math.floor(now.getTime() / 1000);
    const expiresAt = new Date((issuedAt + ACCESS_TOKEN_TTL_SECONDS) * 1000);
    const token = await new SignJWT({
      rid: role.roleAssignmentId,
      role: role.roleCode,
      sid: sessionId,
      site: role.siteId,
    })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(userId)
      .setIssuer(config.issuer)
      .setAudience(config.audience)
      .setIssuedAt(issuedAt)
      .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
      .sign(config.key);

    return { expiresAt, token };
  }

  async verify(token: string): Promise<AccessTokenClaims> {
    try {
      const config = this.config();
      const { payload } = await jwtVerify(token, config.key, {
        algorithms: ['HS256'],
        audience: config.audience,
        issuer: config.issuer,
      });
      const { exp, rid, role, sid, site, sub } = payload;

      if (
        typeof exp !== 'number' ||
        typeof rid !== 'string' ||
        typeof role !== 'string' ||
        !isRoleCode(role) ||
        typeof sid !== 'string' ||
        (site !== null && typeof site !== 'string') ||
        typeof sub !== 'string'
      ) {
        throw new AuthSessionInvalidError();
      }

      return {
        expiresAt: new Date(exp * 1000),
        roleAssignmentId: rid,
        roleCode: role,
        sessionId: sid,
        siteId: site,
        userId: sub,
      };
    } catch (error) {
      if (error instanceof AuthConfigurationError) {
        throw error;
      }

      throw new AuthSessionInvalidError();
    }
  }

  private config(): {
    readonly audience: string;
    readonly issuer: string;
    readonly key: Uint8Array;
  } {
    const secret = process.env['AUTH_ACCESS_TOKEN_SECRET'];

    if (!secret || Buffer.byteLength(secret, 'utf8') < 32) {
      throw new AuthConfigurationError();
    }

    return {
      audience: process.env['AUTH_ACCESS_TOKEN_AUDIENCE'] || DEFAULT_AUDIENCE,
      issuer: process.env['AUTH_ACCESS_TOKEN_ISSUER'] || DEFAULT_ISSUER,
      key: new TextEncoder().encode(secret),
    };
  }
}
