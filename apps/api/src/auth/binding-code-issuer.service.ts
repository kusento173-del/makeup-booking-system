import type { Prisma } from '@makeup/database';
import { Injectable } from '@nestjs/common';

import { AuditCommandService } from '../audit/audit-command.service';
import { DatabaseService } from '../database/database.service';
import { AuthorizationPolicyService } from './authorization-policy.service';
import { BindingTargetNotFoundError, BindingTargetUnavailableError } from './binding-code.errors';
import { BindingCodeHasherService } from './binding-code-hasher.service';
import type {
  BindableRoleCode,
  BindingCodeCommandContext,
  BindingTarget,
  IssueBindingCodeCommand,
  IssuedBindingCode,
} from './binding-code.types';

const BINDING_CODE_LIFETIME_MS = 24 * 60 * 60 * 1000;

interface BindableProfile {
  readonly id: string;
  readonly isActive: boolean;
  readonly isSiteActive: boolean;
  readonly siteId: string;
  readonly userId: string | null;
}

@Injectable()
export class BindingCodeIssuerService {
  constructor(
    private readonly audit: AuditCommandService,
    private readonly authorization: AuthorizationPolicyService,
    private readonly database: DatabaseService,
    private readonly hasher: BindingCodeHasherService,
  ) {}

  issue(
    context: BindingCodeCommandContext,
    command: IssueBindingCodeCommand,
  ): Promise<IssuedBindingCode> {
    return this.database.transaction(async (transaction) => {
      const profile = await this.findProfile(transaction, command);

      if (!profile) {
        throw new BindingTargetNotFoundError();
      }

      this.authorization.assertSiteScope(context, profile.siteId);

      if (profile.userId || !profile.isActive || !profile.isSiteActive) {
        throw new BindingTargetUnavailableError();
      }

      const now = new Date();
      const revoked = await transaction.accountBindingCode.updateMany({
        data: {
          revokeReason: '重新签发',
          revokedAt: now,
          revokedByUserId: context.userId,
          rowVersion: { increment: 1 },
        },
        where: {
          ...this.targetWhere(command),
          consumedAt: null,
          revokedAt: null,
        },
      });
      const code = this.hasher.generate();
      const expiresAt = new Date(now.getTime() + BINDING_CODE_LIFETIME_MS);
      const bindingCode = await transaction.accountBindingCode.create({
        data: {
          ...this.targetData(command),
          codeHash: this.hasher.hash(code),
          createdByUserId: context.userId,
          expiresAt,
          roleCode: command.roleCode,
          siteId: profile.siteId,
        },
        select: { id: true },
      });

      await this.audit.append(transaction, context, {
        action: 'BINDING_CODE_ISSUED',
        afterData: {
          expiresAt: expiresAt.toISOString(),
          profileId: profile.id,
          replacedCodeCount: revoked.count,
          roleCode: command.roleCode,
        },
        objectId: bindingCode.id,
        objectType: 'ACCOUNT_BINDING_CODE',
        siteId: profile.siteId,
      });

      return {
        bindingCodeId: bindingCode.id,
        code,
        expiresAt,
        profileId: profile.id,
        roleCode: command.roleCode,
        siteId: profile.siteId,
      };
    });
  }

  private async findProfile(
    transaction: Prisma.TransactionClient,
    target: BindingTarget,
  ): Promise<BindableProfile | null> {
    if (target.roleCode === 'HOST') {
      const profile = await transaction.hostProfile.findUnique({
        select: {
          id: true,
          qualificationStatus: true,
          site: { select: { status: true } },
          siteId: true,
          userId: true,
        },
        where: { id: target.profileId },
      });

      return profile
        ? {
            id: profile.id,
            isActive: profile.qualificationStatus === 'ACTIVE',
            isSiteActive: profile.site.status === 'ACTIVE',
            siteId: profile.siteId,
            userId: profile.userId,
          }
        : null;
    }

    const profile =
      target.roleCode === 'ARTIST'
        ? await transaction.artistProfile.findUnique({
            select: {
              employmentStatus: true,
              id: true,
              site: { select: { status: true } },
              siteId: true,
              userId: true,
            },
            where: { id: target.profileId },
          })
        : await transaction.operatorProfile.findUnique({
            select: {
              employmentStatus: true,
              id: true,
              site: { select: { status: true } },
              siteId: true,
              userId: true,
            },
            where: { id: target.profileId },
          });

    return profile
      ? {
          id: profile.id,
          isActive: profile.employmentStatus === 'ACTIVE',
          isSiteActive: profile.site.status === 'ACTIVE',
          siteId: profile.siteId,
          userId: profile.userId,
        }
      : null;
  }

  private targetData(target: BindingTarget) {
    switch (target.roleCode) {
      case 'HOST':
        return { hostProfileId: target.profileId };
      case 'ARTIST':
        return { artistProfileId: target.profileId };
      case 'OPERATOR':
        return { operatorProfileId: target.profileId };
    }
  }

  private targetWhere(target: BindingTarget): Prisma.AccountBindingCodeWhereInput {
    const targetField: Record<BindableRoleCode, Prisma.AccountBindingCodeWhereInput> = {
      ARTIST: { artistProfileId: target.profileId },
      HOST: { hostProfileId: target.profileId },
      OPERATOR: { operatorProfileId: target.profileId },
    };

    return targetField[target.roleCode];
  }
}
