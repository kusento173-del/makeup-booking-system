import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../database/database.service';
import { toLoginRoles } from './auth-role.mapper';
import { AuthSessionInvalidError } from './auth-session.errors';
import type { LoginRole } from './login-role.types';
import { OpaqueTokenService } from './opaque-token.service';

const ROLE_SELECTION_LIFETIME_MS = 5 * 60 * 1000;

export interface IssuedRoleSelectionChallenge {
  readonly expiresAt: Date;
  readonly roles: readonly LoginRole[];
  readonly token: string;
}

@Injectable()
export class RoleSelectionChallengeService {
  constructor(
    private readonly database: DatabaseService,
    private readonly tokens: OpaqueTokenService,
  ) {}

  async issue(userId: string): Promise<IssuedRoleSelectionChallenge> {
    return this.database.transaction(async (transaction) => {
      const user = await transaction.appUser.findUnique({
        select: {
          roles: {
            select: { id: true, roleCode: true, siteId: true },
            where: { revokedAt: null },
          },
          status: true,
        },
        where: { id: userId },
      });

      if (!user || user.status !== 'ACTIVE' || user.roles.length < 2) {
        throw new AuthSessionInvalidError();
      }

      const now = new Date();
      await transaction.authRoleSelectionChallenge.updateMany({
        data: { revokedAt: now },
        where: { consumedAt: null, revokedAt: null, userId },
      });
      const token = this.tokens.generate();
      const expiresAt = new Date(now.getTime() + ROLE_SELECTION_LIFETIME_MS);
      await transaction.authRoleSelectionChallenge.create({
        data: { expiresAt, tokenHash: this.tokens.hash(token), userId },
      });

      return { expiresAt, roles: toLoginRoles(user.roles), token };
    });
  }

  async consume(token: string, roleAssignmentId: string): Promise<string> {
    const result = await this.database.transaction(async (transaction) => {
      const now = new Date();
      const challenge = await transaction.authRoleSelectionChallenge.findUnique({
        select: {
          consumedAt: true,
          expiresAt: true,
          id: true,
          revokedAt: true,
          user: {
            select: {
              roles: {
                select: { id: true },
                where: { id: roleAssignmentId, revokedAt: null },
              },
              status: true,
            },
          },
          userId: true,
        },
        where: { tokenHash: this.tokens.hash(token) },
      });

      if (
        !challenge ||
        challenge.consumedAt ||
        challenge.expiresAt <= now ||
        challenge.revokedAt ||
        challenge.user.status !== 'ACTIVE' ||
        challenge.user.roles.length !== 1
      ) {
        return null;
      }

      const consumed = await transaction.authRoleSelectionChallenge.updateMany({
        data: { consumedAt: now },
        where: {
          consumedAt: null,
          expiresAt: { gt: now },
          id: challenge.id,
          revokedAt: null,
        },
      });

      return consumed.count === 1 ? challenge.userId : null;
    });

    if (!result) {
      throw new AuthSessionInvalidError();
    }

    return result;
  }
}
