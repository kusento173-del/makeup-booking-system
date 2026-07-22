import { Prisma } from '@makeup/database';
import { Injectable } from '@nestjs/common';

import { AuditCommandService } from '../audit/audit-command.service';
import { DatabaseService } from '../database/database.service';
import type { AccessTokenClaims } from './auth-session.types';
import { AuthRequestInvalidError } from './auth-request.parser';
import { BackofficeLoginDeniedError } from './backoffice-auth.errors';
import { PasswordHasherService } from './password-hasher.service';

export interface ChangeBackofficePasswordCommand {
  readonly authorization: AccessTokenClaims;
  readonly clientType?: string;
  readonly currentPassword: string;
  readonly ipAddress?: string;
  readonly newPassword: string;
  readonly requestId?: string;
  readonly userAgent?: string;
}

@Injectable()
export class BackofficePasswordService {
  constructor(
    private readonly audit: AuditCommandService,
    private readonly database: DatabaseService,
    private readonly passwords: PasswordHasherService,
  ) {}

  async change(command: ChangeBackofficePasswordCommand): Promise<void> {
    this.passwords.assertPassword(command.newPassword);

    if (command.newPassword === command.currentPassword) {
      throw new AuthRequestInvalidError();
    }

    const nextPasswordHash = await this.passwords.hash(command.newPassword);
    const { authorization } = command;

    await this.database.transaction(async (transaction) => {
      await transaction.$queryRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`PASSWORD_CHANGE:${authorization.userId}`}, 0))`,
      );
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
        user?.status === 'ACTIVE' &&
        user.roles.length === 1 &&
        ['CUSTOMER_SERVICE', 'ADMIN'].includes(authorization.roleCode);
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
