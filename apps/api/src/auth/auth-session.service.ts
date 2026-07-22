import type { Prisma } from '@makeup/database';
import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../database/database.service';
import { AccessTokenService } from './access-token.service';
import { isRoleCode } from './auth-role.mapper';
import { AuthSessionInvalidError } from './auth-session.errors';
import type { AccessTokenClaims, SessionRole, SessionTokenPair } from './auth-session.types';
import { OpaqueTokenService } from './opaque-token.service';

const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

interface ActiveSessionRoleRecord {
  readonly id: string;
  readonly roleCode: string;
  readonly siteId: string | null;
}

@Injectable()
export class AuthSessionService {
  constructor(
    private readonly accessTokens: AccessTokenService,
    private readonly database: DatabaseService,
    private readonly opaqueTokens: OpaqueTokenService,
  ) {}

  async create(userId: string, roleAssignmentId: string): Promise<SessionTokenPair> {
    const refreshToken = this.opaqueTokens.generate();
    const now = new Date();
    const refreshTokenExpiresAt = new Date(now.getTime() + REFRESH_TOKEN_TTL_MS);
    const created = await this.database.transaction(async (transaction) => {
      const role = await this.findActiveRole(transaction, userId, roleAssignmentId);

      if (!role) {
        return null;
      }

      const session = await transaction.authSession.create({
        data: {
          expiresAt: refreshTokenExpiresAt,
          refreshTokenHash: this.opaqueTokens.hash(refreshToken),
          roleAssignmentId,
          userId,
        },
        select: { id: true },
      });
      await transaction.appUser.update({
        data: { lastLoginAt: now, rowVersion: { increment: 1 } },
        where: { id: userId },
      });

      return this.issuePair(
        userId,
        session.id,
        this.toSessionRole(role),
        refreshToken,
        refreshTokenExpiresAt,
        now,
      );
    });

    if (!created) {
      throw new AuthSessionInvalidError();
    }

    return created;
  }

  async refresh(refreshToken: string): Promise<SessionTokenPair> {
    const currentHash = this.opaqueTokens.hash(refreshToken);
    const nextRefreshToken = this.opaqueTokens.generate();
    const now = new Date();
    const refreshed = await this.database.transaction(async (transaction) => {
      const session = await transaction.authSession.findUnique({
        select: {
          expiresAt: true,
          id: true,
          roleAssignment: { select: { id: true, revokedAt: true, roleCode: true, siteId: true } },
          rowVersion: true,
          user: { select: { id: true, status: true } },
        },
        where: { refreshTokenHash: currentHash },
      });

      if (
        !session ||
        session.expiresAt <= now ||
        session.user.status !== 'ACTIVE' ||
        !session.roleAssignment ||
        session.roleAssignment.revokedAt
      ) {
        return null;
      }

      const updated = await transaction.authSession.updateMany({
        data: {
          lastSeenAt: now,
          refreshTokenHash: this.opaqueTokens.hash(nextRefreshToken),
          rowVersion: { increment: 1 },
        },
        where: {
          expiresAt: { gt: now },
          id: session.id,
          refreshTokenHash: currentHash,
          revokedAt: null,
          rowVersion: session.rowVersion,
        },
      });

      if (updated.count !== 1) {
        return null;
      }

      return this.issuePair(
        session.user.id,
        session.id,
        this.toSessionRole(session.roleAssignment),
        nextRefreshToken,
        session.expiresAt,
        now,
      );
    });

    if (!refreshed) {
      throw new AuthSessionInvalidError();
    }

    return refreshed;
  }

  async authenticate(accessToken: string): Promise<AccessTokenClaims> {
    const claims = await this.accessTokens.verify(accessToken);
    const valid = await this.database.read((database) =>
      database.authSession.findFirst({
        select: { id: true },
        where: {
          expiresAt: { gt: new Date() },
          id: claims.sessionId,
          revokedAt: null,
          roleAssignment: {
            id: claims.roleAssignmentId,
            revokedAt: null,
            roleCode: claims.roleCode,
            siteId: claims.siteId,
          },
          roleAssignmentId: claims.roleAssignmentId,
          user: { status: 'ACTIVE' },
          userId: claims.userId,
        },
      }),
    );

    if (!valid) {
      throw new AuthSessionInvalidError();
    }

    return claims;
  }

  async revoke(userId: string, sessionId: string, reason = 'USER_LOGOUT'): Promise<void> {
    await this.database.read((database) =>
      database.authSession.updateMany({
        data: {
          revokeReason: this.normalizeReason(reason),
          revokedAt: new Date(),
          rowVersion: { increment: 1 },
        },
        where: { id: sessionId, revokedAt: null, userId },
      }),
    );
  }

  async revokeAll(userId: string, reason = 'ALL_SESSIONS_REVOKED'): Promise<number> {
    const result = await this.database.read((database) =>
      database.authSession.updateMany({
        data: {
          revokeReason: this.normalizeReason(reason),
          revokedAt: new Date(),
          rowVersion: { increment: 1 },
        },
        where: { revokedAt: null, userId },
      }),
    );

    return result.count;
  }

  private async findActiveRole(
    transaction: Prisma.TransactionClient,
    userId: string,
    roleAssignmentId: string,
  ): Promise<ActiveSessionRoleRecord | null> {
    return transaction.userRole.findFirst({
      select: { id: true, roleCode: true, siteId: true },
      where: {
        id: roleAssignmentId,
        revokedAt: null,
        user: { status: 'ACTIVE' },
        userId,
      },
    });
  }

  private async issuePair(
    userId: string,
    sessionId: string,
    role: SessionRole,
    refreshToken: string,
    refreshTokenExpiresAt: Date,
    now: Date,
  ): Promise<SessionTokenPair> {
    const access = await this.accessTokens.issue(userId, sessionId, role, now);

    return {
      accessToken: access.token,
      accessTokenExpiresAt: access.expiresAt,
      refreshToken,
      refreshTokenExpiresAt,
      role,
      sessionId,
      userId,
    };
  }

  private normalizeReason(reason: string): string {
    const normalized = reason.normalize('NFKC').trim();
    return normalized ? normalized.slice(0, 500) : 'SESSION_REVOKED';
  }

  private toSessionRole(role: ActiveSessionRoleRecord): SessionRole {
    if (!isRoleCode(role.roleCode)) {
      throw new AuthSessionInvalidError();
    }

    return {
      roleAssignmentId: role.id,
      roleCode: role.roleCode,
      siteId: role.siteId,
    };
  }
}
