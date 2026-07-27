import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../database/database.service';
import { AuthSessionInvalidError } from './auth-session.errors';
import { OpaqueTokenService } from './opaque-token.service';

const CHALLENGE_LIFETIME_MS = 5 * 60 * 1000;

export interface IssuedPasswordChangeChallenge {
  readonly expiresAt: Date;
  readonly token: string;
}

@Injectable()
export class PasswordChangeChallengeService {
  constructor(
    private readonly database: DatabaseService,
    private readonly tokens: OpaqueTokenService,
  ) {}

  async issue(userId: string): Promise<IssuedPasswordChangeChallenge> {
    return this.database.transaction(async (transaction) => {
      const user = await transaction.appUser.findUnique({
        select: {
          passwordCredential: { select: { mustChangePassword: true } },
          status: true,
        },
        where: { id: userId },
      });

      if (user?.status !== 'ACTIVE' || user.passwordCredential?.mustChangePassword !== true) {
        throw new AuthSessionInvalidError();
      }

      const now = new Date();
      await transaction.authPasswordChangeChallenge.updateMany({
        data: { revokedAt: now },
        where: { consumedAt: null, revokedAt: null, userId },
      });
      const token = this.tokens.generate();
      const expiresAt = new Date(now.getTime() + CHALLENGE_LIFETIME_MS);
      await transaction.authPasswordChangeChallenge.create({
        data: { expiresAt, tokenHash: this.tokens.hash(token), userId },
      });

      return { expiresAt, token };
    });
  }
}
