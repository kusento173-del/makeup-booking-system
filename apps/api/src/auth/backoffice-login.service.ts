import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../database/database.service';
import { acquireTransactionLock } from '../database/transaction-lock';
import { toLoginRoles } from './auth-role.mapper';
import { BackofficeLoginDeniedError } from './backoffice-auth.errors';
import { normalizeBackofficeLoginName } from './backoffice-login-name';
import { PasswordHasherService } from './password-hasher.service';
import type { LoginRole } from './wechat-login.types';

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;

export interface VerifiedBackofficeAccount {
  readonly mustChangePassword: boolean;
  readonly roles: readonly LoginRole[];
  readonly userId: string;
}

@Injectable()
export class BackofficeLoginService {
  constructor(
    private readonly database: DatabaseService,
    private readonly passwords: PasswordHasherService,
  ) {}

  async verify(loginName: string, password: string): Promise<VerifiedBackofficeAccount> {
    const normalizedLoginName = this.normalizeLoginName(loginName);
    const account = await this.database.transaction(async (transaction) => {
      await acquireTransactionLock(transaction, `PASSWORD_LOGIN:${normalizedLoginName}`);
      const identity = await transaction.userIdentity.findUnique({
        select: {
          status: true,
          user: {
            select: {
              id: true,
              passwordCredential: true,
              roles: {
                select: { id: true, roleCode: true, siteId: true },
                where: { revokedAt: null },
              },
              status: true,
            },
          },
        },
        where: {
          provider_providerAppId_externalSubject: {
            externalSubject: normalizedLoginName,
            provider: 'PASSWORD',
            providerAppId: 'BACKOFFICE',
          },
        },
      });

      if (!identity?.user.passwordCredential) {
        await this.passwords.verify(null, password);
        return null;
      }

      const credential = identity.user.passwordCredential;
      const now = new Date();

      if (
        identity.status !== 'ACTIVE' ||
        identity.user.status !== 'ACTIVE' ||
        identity.user.roles.length === 0 ||
        (credential.lockedUntil && credential.lockedUntil > now)
      ) {
        await this.passwords.verify(credential.passwordHash, password);
        return null;
      }

      if (!(await this.passwords.verify(credential.passwordHash, password))) {
        const previousAttempts = credential.lockedUntil ? 0 : credential.failedAttemptCount;
        const failedAttemptCount = previousAttempts + 1;
        await transaction.passwordCredential.update({
          data: {
            failedAttemptCount,
            lockedUntil:
              failedAttemptCount >= MAX_FAILED_ATTEMPTS
                ? new Date(now.getTime() + LOCK_DURATION_MS)
                : null,
          },
          where: { userId: identity.user.id },
        });
        return null;
      }

      await transaction.passwordCredential.update({
        data: { failedAttemptCount: 0, lockedUntil: null },
        where: { userId: identity.user.id },
      });

      return {
        mustChangePassword: credential.mustChangePassword,
        roles: toLoginRoles(identity.user.roles),
        userId: identity.user.id,
      };
    });

    if (!account) {
      throw new BackofficeLoginDeniedError();
    }

    return account;
  }

  normalizeLoginName(loginName: string): string {
    const normalized = normalizeBackofficeLoginName(loginName);

    if (!normalized) {
      throw new BackofficeLoginDeniedError();
    }

    return normalized;
  }
}
