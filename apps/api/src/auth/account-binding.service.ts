import type { Prisma } from '@makeup/database';
import { Injectable } from '@nestjs/common';

import { AuditCommandService } from '../audit/audit-command.service';
import { DatabaseService } from '../database/database.service';
import type {
  AccountBindingTarget,
  BindWechatAccountCommand,
  BoundWechatAccount,
  ResolvedBindingTarget,
} from './account-binding.types';
import { toLoginRoles } from './auth-role.mapper';
import { BindingChallengeService } from './binding-challenge.service';
import { BindingCodeInvalidError } from './binding-code.errors';
import { BindingCodeVerifierService } from './binding-code-verifier.service';
import { AccountLoginDeniedError, BindingChallengeInvalidError } from './wechat-login.errors';

@Injectable()
export class AccountBindingService {
  constructor(
    private readonly audit: AuditCommandService,
    private readonly challenges: BindingChallengeService,
    private readonly codes: BindingCodeVerifierService,
    private readonly database: DatabaseService,
  ) {}

  async bind(command: BindWechatAccountCommand): Promise<BoundWechatAccount> {
    const result = await this.database.transaction(async (transaction) => {
      const challenge = await this.challenges.resolve(transaction, command.bindingChallenge);

      if (!challenge) {
        throw new BindingChallengeInvalidError();
      }

      if (!['PENDING_BINDING', 'ACTIVE'].includes(challenge.userStatus)) {
        throw new AccountLoginDeniedError();
      }

      const target = await this.resolveTarget(transaction, command.target);

      if (!target) {
        return null;
      }

      const consumedCode = await this.codes.tryConsume(transaction, {
        code: command.bindingCode,
        consumerUserId: challenge.userId,
        profileId: target.profileId,
        roleCode: target.roleCode,
      });

      if (!consumedCode) {
        return null;
      }

      if (consumedCode.siteId !== target.siteId) {
        throw new BindingCodeInvalidError();
      }

      const profileUpdated = await this.bindProfile(transaction, target, challenge.userId);

      if (!profileUpdated) {
        throw new BindingCodeInvalidError();
      }

      const role = await transaction.userRole.create({
        data: {
          roleCode: target.roleCode,
          siteId: target.siteId,
          userId: challenge.userId,
        },
        select: { id: true },
      });
      const userUpdated = await transaction.appUser.updateMany({
        data: {
          displayName: target.displayName,
          rowVersion: { increment: 1 },
          status: 'ACTIVE',
        },
        where: { id: challenge.userId, status: { in: ['PENDING_BINDING', 'ACTIVE'] } },
      });

      if (userUpdated.count !== 1 || !(await this.challenges.consume(transaction, challenge))) {
        throw new BindingChallengeInvalidError();
      }

      await this.audit.append(
        transaction,
        {
          actorName: target.displayName,
          ...(command.clientType ? { clientType: command.clientType } : {}),
          ...(command.ipAddress ? { ipAddress: command.ipAddress } : {}),
          ...(command.requestId ? { requestId: command.requestId } : {}),
          roleCode: target.roleCode,
          ...(command.userAgent ? { userAgent: command.userAgent } : {}),
          userId: challenge.userId,
        },
        {
          action: 'ACCOUNT_PROFILE_BOUND',
          afterData: {
            bindingCodeId: consumedCode.bindingCodeId,
            profileId: target.profileId,
            roleAssignmentId: role.id,
            roleCode: target.roleCode,
          },
          objectId: challenge.userId,
          objectType: 'APP_USER',
          siteId: target.siteId,
        },
      );

      const roles = toLoginRoles(
        await transaction.userRole.findMany({
          select: { id: true, roleCode: true, siteId: true },
          where: { revokedAt: null, userId: challenge.userId },
        }),
      );

      return {
        requiresRoleSelection: roles.length > 1,
        roles,
        userId: challenge.userId,
      };
    });

    if (!result) {
      throw new BindingCodeInvalidError();
    }

    return result;
  }

  private async bindProfile(
    transaction: Prisma.TransactionClient,
    target: ResolvedBindingTarget,
    userId: string,
  ): Promise<boolean> {
    const commonWhere = { id: target.profileId, rowVersion: target.rowVersion, userId: null };
    const data = { rowVersion: { increment: 1 }, userId };

    switch (target.roleCode) {
      case 'HOST':
        return (
          (
            await transaction.hostProfile.updateMany({
              data,
              where: { ...commonWhere, qualificationStatus: 'ACTIVE' },
            })
          ).count === 1
        );
      case 'ARTIST':
        return (
          (
            await transaction.artistProfile.updateMany({
              data,
              where: { ...commonWhere, employmentStatus: 'ACTIVE' },
            })
          ).count === 1
        );
      case 'OPERATOR':
        return (
          (
            await transaction.operatorProfile.updateMany({
              data,
              where: { ...commonWhere, employmentStatus: 'ACTIVE' },
            })
          ).count === 1
        );
    }
  }

  private normalize(value: string): string {
    return value.normalize('NFKC').trim().toLocaleLowerCase('en-US');
  }

  private async resolveTarget(
    transaction: Prisma.TransactionClient,
    target: AccountBindingTarget,
  ): Promise<ResolvedBindingTarget | null> {
    if (target.roleCode === 'HOST') {
      const profile = await transaction.hostProfile.findUnique({
        select: {
          hostCode: true,
          id: true,
          qualificationStatus: true,
          realName: true,
          rowVersion: true,
          site: { select: { status: true } },
          siteId: true,
          userId: true,
        },
        where: { hostCode: target.hostCode.normalize('NFKC').trim() },
      });

      return profile &&
        !profile.userId &&
        profile.qualificationStatus === 'ACTIVE' &&
        profile.site.status === 'ACTIVE'
        ? {
            displayName: profile.realName,
            profileId: profile.id,
            roleCode: 'HOST',
            rowVersion: profile.rowVersion,
            siteId: profile.siteId,
          }
        : null;
    }

    if (target.roleCode === 'ARTIST') {
      const profile = await transaction.artistProfile.findFirst({
        select: {
          employmentStatus: true,
          id: true,
          nickname: true,
          rowVersion: true,
          site: { select: { status: true } },
          siteId: true,
          userId: true,
        },
        where: {
          employmentStatus: 'ACTIVE',
          nicknameNormalized: this.normalize(target.nickname),
        },
      });

      return profile && !profile.userId && profile.site.status === 'ACTIVE'
        ? {
            displayName: profile.nickname,
            profileId: profile.id,
            roleCode: 'ARTIST',
            rowVersion: profile.rowVersion,
            siteId: profile.siteId,
          }
        : null;
    }

    const profile = await transaction.operatorProfile.findFirst({
      select: {
        employmentStatus: true,
        id: true,
        realName: true,
        rowVersion: true,
        site: { select: { status: true } },
        siteId: true,
        userId: true,
      },
      where: {
        employmentStatus: 'ACTIVE',
        nameNormalized: this.normalize(target.realName),
        site: { code: target.siteCode.normalize('NFKC').trim().toLocaleUpperCase('en-US') },
      },
    });

    return profile && !profile.userId && profile.site.status === 'ACTIVE'
      ? {
          displayName: profile.realName,
          profileId: profile.id,
          roleCode: 'OPERATOR',
          rowVersion: profile.rowVersion,
          siteId: profile.siteId,
        }
      : null;
  }
}
