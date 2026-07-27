import { Injectable } from '@nestjs/common';

import { AuditCommandService } from '../audit/audit-command.service';
import { DatabaseService } from '../database/database.service';
import { acquireTransactionLock } from '../database/transaction-lock';
import { toLoginRoles } from './auth-role.mapper';
import type { AccessTokenClaims } from './auth-session.types';
import { AuthRequestInvalidError } from './auth-request.parser';
import { BackofficeLoginDeniedError } from './backoffice-auth.errors';
import { OpaqueTokenService } from './opaque-token.service';
import { PasswordHasherService } from './password-hasher.service';
import type { LoginRole } from './wechat-login.types';

export interface ChangeBackofficePasswordCommand {
  readonly authorization: AccessTokenClaims;
  readonly clientType?: string;
  readonly currentPassword: string;
  readonly ipAddress?: string;
  readonly newPassword: string;
  readonly requestId?: string;
  readonly userAgent?: string;
}

export interface CompleteInitialPasswordChangeCommand {
  readonly clientType?: string;
  readonly ipAddress?: string;
  readonly newPassword: string;
  readonly passwordChangeChallenge: string;
  readonly requestId?: string;
  readonly userAgent?: string;
}

export interface CompletedPasswordAccount {
  readonly roles: readonly LoginRole[];
  readonly userId: string;
}

@Injectable()
export class BackofficePasswordService {
  constructor(
    private readonly audit: AuditCommandService,
    private readonly database: DatabaseService,
    private readonly passwords: PasswordHasherService,
    private readonly opaqueTokens: OpaqueTokenService,
  ) {}

  async completeInitial(
    command: CompleteInitialPasswordChangeCommand,
  ): Promise<CompletedPasswordAccount> {
    this.passwords.assertPassword(command.newPassword);
    const nextPasswordHash = await this.passwords.hash(command.newPassword);
    const tokenHash = this.opaqueTokens.hash(command.passwordChangeChallenge);

    const account = await this.database.transaction(async (transaction) => {
      await acquireTransactionLock(transaction, `PASSWORD_CHALLENGE:${tokenHash}`);
      const now = new Date();
      const challenge = await transaction.authPasswordChangeChallenge.findUnique({
        select: {
          consumedAt: true,
          expiresAt: true,
          id: true,
          revokedAt: true,
          user: {
            select: {
              displayName: true,
              id: true,
              passwordCredential: {
                select: { mustChangePassword: true, passwordHash: true },
              },
              roles: {
                select: { id: true, roleCode: true, siteId: true },
                where: { revokedAt: null },
              },
              status: true,
            },
          },
        },
        where: { tokenHash },
      });
      const user = challenge?.user;

      if (
        !challenge ||
        challenge.consumedAt ||
        challenge.expiresAt <= now ||
        challenge.revokedAt ||
        user?.status !== 'ACTIVE' ||
        user.roles.length === 0 ||
        user.passwordCredential?.mustChangePassword !== true ||
        (await this.passwords.verify(user.passwordCredential.passwordHash, command.newPassword))
      ) {
        return null;
      }

      const consumed = await transaction.authPasswordChangeChallenge.updateMany({
        data: { consumedAt: now },
        where: {
          consumedAt: null,
          expiresAt: { gt: now },
          id: challenge.id,
          revokedAt: null,
        },
      });

      if (consumed.count !== 1) {
        return null;
      }

      await transaction.passwordCredential.update({
        data: {
          failedAttemptCount: 0,
          lockedUntil: null,
          mustChangePassword: false,
          passwordChangedAt: now,
          passwordHash: nextPasswordHash,
        },
        where: { userId: user.id },
      });
      const revoked = await transaction.authSession.updateMany({
        data: {
          revokeReason: 'PASSWORD_CHANGED',
          revokedAt: now,
          rowVersion: { increment: 1 },
        },
        where: { revokedAt: null, userId: user.id },
      });
      const roles = toLoginRoles(user.roles);

      await this.audit.append(
        transaction,
        {
          actorName: user.displayName,
          ...(command.clientType ? { clientType: command.clientType } : {}),
          ...(command.ipAddress ? { ipAddress: command.ipAddress } : {}),
          ...(command.requestId ? { requestId: command.requestId } : {}),
          roleCode: roles[0]?.roleCode ?? 'SYSTEM',
          ...(command.userAgent ? { userAgent: command.userAgent } : {}),
          userId: user.id,
        },
        {
          action: 'INITIAL_PASSWORD_CHANGED',
          afterData: {
            passwordChangedAt: now.toISOString(),
            revokedSessionCount: revoked.count,
          },
          objectId: user.id,
          objectType: 'APP_USER',
          siteId: roles[0]?.siteId ?? undefined,
        },
      );

      return { roles, userId: user.id };
    });

    if (!account) {
      throw new BackofficeLoginDeniedError();
    }

    return account;
  }

  async change(command: ChangeBackofficePasswordCommand): Promise<void> {
    this.passwords.assertPassword(command.newPassword);

    if (command.newPassword === command.currentPassword) {
      throw new AuthRequestInvalidError();
    }

    const nextPasswordHash = await this.passwords.hash(command.newPassword);
    const { authorization } = command;

    await this.database.transaction(async (transaction) => {
      await acquireTransactionLock(transaction, `PASSWORD_CHANGE:${authorization.userId}`);
      const user = await transaction.appUser.findUnique({
        select: {
          displayName: true,
          passwordCredential: { select: { passwordHash: true } },
          roles: {
            select: { id: true },
            where: {
              id: authorization.roleAssignmentId,
              revokedAt: null,
              roleCode: authorization.roleCode,
            },
          },
          status: true,
        },
        where: { id: authorization.userId },
      });
      const canChange =
        user?.status === 'ACTIVE' && user.roles.length === 1 && user.passwordCredential !== null;
      const currentMatches = await this.passwords.verify(
        user?.passwordCredential?.passwordHash ?? null,
        command.currentPassword,
      );

      if (!canChange || !currentMatches || !user?.passwordCredential) {
        throw new BackofficeLoginDeniedError();
      }

      const changedAt = new Date();
      await transaction.passwordCredential.update({
        data: {
          failedAttemptCount: 0,
          lockedUntil: null,
          mustChangePassword: false,
          passwordChangedAt: changedAt,
          passwordHash: nextPasswordHash,
        },
        where: { userId: authorization.userId },
      });
      const revoked = await transaction.authSession.updateMany({
        data: {
          revokeReason: 'PASSWORD_CHANGED',
          revokedAt: changedAt,
          rowVersion: { increment: 1 },
        },
        where: { revokedAt: null, userId: authorization.userId },
      });

      await this.audit.append(
        transaction,
        {
          actorName: user.displayName,
          ...(command.clientType ? { clientType: command.clientType } : {}),
          ...(command.ipAddress ? { ipAddress: command.ipAddress } : {}),
          ...(command.requestId ? { requestId: command.requestId } : {}),
          roleCode: authorization.roleCode,
          ...(command.userAgent ? { userAgent: command.userAgent } : {}),
          userId: authorization.userId,
        },
        {
          action: 'PASSWORD_CHANGED',
          afterData: {
            passwordChangedAt: changedAt.toISOString(),
            revokedSessionCount: revoked.count,
          },
          objectId: authorization.userId,
          objectType: 'APP_USER',
          siteId: authorization.siteId ?? undefined,
        },
      );
    });
  }
}
