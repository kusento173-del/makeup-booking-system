import type { Prisma } from '@makeup/database';
import { Injectable } from '@nestjs/common';

import { AuditCommandService } from '../audit/audit-command.service';
import {
  AuthorizationDeniedError,
  AuthorizationPolicyService,
} from '../auth/authorization-policy.service';
import { normalizeBackofficeLoginName } from '../auth/backoffice-login-name';
import { PasswordHasherService } from '../auth/password-hasher.service';
import { DatabaseService } from '../database/database.service';
import { acquireTransactionLock } from '../database/transaction-lock';
import {
  BackofficeAccountConflictError,
  BackofficeAccountNotFoundError,
} from './backoffice-account.errors';
import type {
  ProfileAccountRoleCode,
  ProvisionedProfileAccount,
  ProvisionProfileAccountCommand,
  ResetWebAccountPasswordCommand,
  WebAccountContext,
} from './web-account.types';
import { requiredMasterDataText } from './master-data-text';

interface ProfileTarget {
  readonly displayName: string;
  readonly siteId: string;
  readonly suggestedLoginName?: string;
  readonly userId: string | null;
}

@Injectable()
export class WebAccountService {
  constructor(
    private readonly audit: AuditCommandService,
    private readonly authorization: AuthorizationPolicyService,
    private readonly database: DatabaseService,
    private readonly passwords: PasswordHasherService,
  ) {}

  async provisionProfile(
    context: WebAccountContext,
    command: ProvisionProfileAccountCommand,
  ): Promise<ProvisionedProfileAccount> {
    this.authorization.assertRole(context, ['ADMIN', 'CUSTOMER_SERVICE']);
    const passwordHash = await this.passwords.hash(command.temporaryPassword);

    return this.database.transaction(async (transaction) => {
      await acquireTransactionLock(
        transaction,
        `PROFILE_ACCOUNT:${command.roleCode}:${command.profileId}`,
      );
      const profile = await this.findProfile(transaction, command.roleCode, command.profileId);
      this.authorization.assertSiteScope(context, profile.siteId);
      const loginName = normalizeBackofficeLoginName(
        command.loginName ?? profile.suggestedLoginName ?? '',
      );
      if (!loginName) {
        throw new BackofficeAccountConflictError();
      }

      const existingIdentity = await transaction.userIdentity.findUnique({
        select: { id: true },
        where: {
          provider_providerAppId_externalSubject: {
            externalSubject: loginName,
            provider: 'PASSWORD',
            providerAppId: 'BACKOFFICE',
          },
        },
      });
      if (existingIdentity) {
        throw new BackofficeAccountConflictError();
      }

      const userId = profile.userId
        ? await this.attachToExistingUser(
            transaction,
            profile,
            command.roleCode,
            context,
            loginName,
            passwordHash,
          )
        : await this.createProfileUser(
            transaction,
            profile,
            command,
            context,
            loginName,
            passwordHash,
          );

      await this.audit.append(transaction, context, {
        action: 'WEB_PROFILE_ACCOUNT_PROVISIONED',
        afterData: {
          loginName,
          mustChangePassword: true,
          profileId: command.profileId,
          roleCode: command.roleCode,
        },
        objectId: userId,
        objectType: 'APP_USER',
        siteId: profile.siteId,
      });

      return { loginName, userId };
    });
  }

  async resetPassword(
    context: WebAccountContext,
    command: ResetWebAccountPasswordCommand,
  ): Promise<void> {
    this.authorization.assertRole(context, ['ADMIN', 'CUSTOMER_SERVICE']);
    const reason = requiredMasterDataText(command.reason, 'reason');
    const passwordHash = await this.passwords.hash(command.temporaryPassword);

    await this.database.transaction(async (transaction) => {
      const profile = await this.findProfile(transaction, command.roleCode, command.profileId);
      this.authorization.assertSiteScope(context, profile.siteId);
      if (!profile.userId) {
        throw new BackofficeAccountNotFoundError();
      }
      await acquireTransactionLock(transaction, `PASSWORD_RESET:${profile.userId}`);
      const user = await transaction.appUser.findUnique({
        select: {
          displayName: true,
          hostProfile: { select: { siteId: true } },
          artistProfile: { select: { siteId: true } },
          operatorProfile: { select: { siteId: true } },
          passwordCredential: { select: { userId: true } },
          roles: {
            select: { roleCode: true, siteId: true },
            where: { revokedAt: null },
          },
          status: true,
        },
        where: { id: profile.userId },
      });
      if (!user?.passwordCredential) {
        throw new BackofficeAccountNotFoundError();
      }
      const mobileProfileSiteId =
        user.hostProfile?.siteId ?? user.artistProfile?.siteId ?? user.operatorProfile?.siteId;
      if (
        mobileProfileSiteId !== profile.siteId ||
        user.roles.some((role) => ['ADMIN', 'CUSTOMER_SERVICE'].includes(role.roleCode))
      ) {
        throw new AuthorizationDeniedError();
      }

      const now = new Date();
      await transaction.passwordCredential.update({
        data: {
          failedAttemptCount: 0,
          lockedUntil: null,
          mustChangePassword: true,
          passwordChangedAt: now,
          passwordHash,
        },
        where: { userId: profile.userId },
      });
      const revokedSessions = await transaction.authSession.updateMany({
        data: {
          revokeReason: 'PASSWORD_RESET',
          revokedAt: now,
          rowVersion: { increment: 1 },
        },
        where: { revokedAt: null, userId: profile.userId },
      });
      await transaction.authPasswordChangeChallenge.updateMany({
        data: { revokedAt: now },
        where: { consumedAt: null, revokedAt: null, userId: profile.userId },
      });

      await this.audit.append(transaction, context, {
        action: 'WEB_ACCOUNT_PASSWORD_RESET',
        afterData: {
          mustChangePassword: true,
          revokedSessionCount: revokedSessions.count,
        },
        objectId: profile.userId,
        objectType: 'APP_USER',
        reason,
        ...(mobileProfileSiteId ? { siteId: mobileProfileSiteId } : {}),
      });
    });
  }

  private async attachToExistingUser(
    transaction: Prisma.TransactionClient,
    profile: ProfileTarget,
    roleCode: ProfileAccountRoleCode,
    context: WebAccountContext,
    loginName: string,
    passwordHash: string,
  ): Promise<string> {
    const user = await transaction.appUser.findUnique({
      select: {
        id: true,
        passwordCredential: { select: { userId: true } },
        roles: {
          select: { id: true },
          where: { revokedAt: null, roleCode },
        },
        status: true,
      },
      where: { id: profile.userId ?? '' },
    });
    if (!user || user.status !== 'ACTIVE' || user.passwordCredential) {
      throw new BackofficeAccountConflictError();
    }
    await transaction.userIdentity.create({
      data: {
        externalSubject: loginName,
        provider: 'PASSWORD',
        providerAppId: 'BACKOFFICE',
        userId: user.id,
      },
    });
    await transaction.passwordCredential.create({
      data: { mustChangePassword: true, passwordHash, userId: user.id },
    });
    if (user.roles.length === 0) {
      await transaction.userRole.create({
        data: {
          assignedByUserId: context.userId,
          roleCode,
          siteId: profile.siteId,
          userId: user.id,
        },
      });
    }
    return user.id;
  }

  private async createProfileUser(
    transaction: Prisma.TransactionClient,
    profile: ProfileTarget,
    command: ProvisionProfileAccountCommand,
    context: WebAccountContext,
    loginName: string,
    passwordHash: string,
  ): Promise<string> {
    const user = await transaction.appUser.create({
      data: { displayName: profile.displayName, status: 'ACTIVE' },
      select: { id: true },
    });
    await transaction.userIdentity.create({
      data: {
        externalSubject: loginName,
        provider: 'PASSWORD',
        providerAppId: 'BACKOFFICE',
        userId: user.id,
      },
    });
    await transaction.passwordCredential.create({
      data: { mustChangePassword: true, passwordHash, userId: user.id },
    });
    await transaction.userRole.create({
      data: {
        assignedByUserId: context.userId,
        roleCode: command.roleCode,
        siteId: profile.siteId,
        userId: user.id,
      },
    });
    const linked =
      command.roleCode === 'HOST'
        ? await transaction.hostProfile.updateMany({
            data: { rowVersion: { increment: 1 }, userId: user.id },
            where: { id: command.profileId, userId: null },
          })
        : command.roleCode === 'ARTIST'
          ? await transaction.artistProfile.updateMany({
              data: { rowVersion: { increment: 1 }, userId: user.id },
              where: { id: command.profileId, userId: null },
            })
          : await transaction.operatorProfile.updateMany({
              data: { rowVersion: { increment: 1 }, userId: user.id },
              where: { id: command.profileId, userId: null },
            });
    if (linked.count !== 1) {
      throw new BackofficeAccountConflictError();
    }
    return user.id;
  }

  private async findProfile(
    transaction: Prisma.TransactionClient,
    roleCode: ProfileAccountRoleCode,
    profileId: string,
  ): Promise<ProfileTarget> {
    if (roleCode === 'HOST') {
      const profile = await transaction.hostProfile.findUnique({
        select: { hostCode: true, realName: true, siteId: true, userId: true },
        where: { id: profileId },
      });
      if (!profile) {
        throw new BackofficeAccountNotFoundError();
      }
      return {
        displayName: profile.realName,
        siteId: profile.siteId,
        suggestedLoginName: profile.hostCode,
        userId: profile.userId,
      };
    }
    if (roleCode === 'ARTIST') {
      const profile = await transaction.artistProfile.findUnique({
        select: { nickname: true, siteId: true, userId: true },
        where: { id: profileId },
      });
      if (!profile) {
        throw new BackofficeAccountNotFoundError();
      }
      return {
        displayName: profile.nickname,
        siteId: profile.siteId,
        userId: profile.userId,
      };
    }
    const profile = await transaction.operatorProfile.findUnique({
      select: { realName: true, siteId: true, userId: true },
      where: { id: profileId },
    });
    if (!profile) {
      throw new BackofficeAccountNotFoundError();
    }
    return {
      displayName: profile.realName,
      siteId: profile.siteId,
      userId: profile.userId,
    };
  }
}
