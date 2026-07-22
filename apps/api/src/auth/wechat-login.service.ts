import { Prisma } from '@makeup/database';
import { Inject, Injectable } from '@nestjs/common';

import { DatabaseService } from '../database/database.service';
import { toLoginRoles } from './auth-role.mapper';
import { BindingChallengeService } from './binding-challenge.service';
import { AccountLoginDeniedError } from './wechat-login.errors';
import {
  WECHAT_LOGIN_ADAPTER,
  type WechatLoginIdentity,
  type WechatLoginPort,
} from './wechat-login.port';
import type { LoginRole, WechatLoginResult } from './wechat-login.types';

@Injectable()
export class WechatLoginService {
  constructor(
    private readonly challenges: BindingChallengeService,
    private readonly database: DatabaseService,
    @Inject(WECHAT_LOGIN_ADAPTER) private readonly wechat: WechatLoginPort,
  ) {}

  async login(jsCode: string): Promise<WechatLoginResult> {
    const identity = await this.wechat.exchangeCode(jsCode);

    return this.database.transaction(async (transaction) => {
      await transaction.$queryRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${this.lockKey(identity)}, 0))`,
      );
      const existingIdentity = await transaction.userIdentity.findUnique({
        select: {
          status: true,
          user: {
            select: {
              id: true,
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
            externalSubject: identity.externalSubject,
            provider: 'WECHAT_MINIPROGRAM',
            providerAppId: identity.providerAppId,
          },
        },
      });

      if (existingIdentity) {
        if (existingIdentity.status !== 'ACTIVE' || existingIdentity.user.status === 'DISABLED') {
          throw new AccountLoginDeniedError();
        }

        const roles = toLoginRoles(existingIdentity.user.roles);

        if (existingIdentity.user.status === 'ACTIVE' && roles.length > 0) {
          return this.recognized(existingIdentity.user.id, roles);
        }

        return this.bindingRequired(transaction, existingIdentity.user.id);
      }

      const user = await transaction.appUser.create({
        data: { displayName: '待绑定用户', status: 'PENDING_BINDING' },
        select: { id: true },
      });
      await transaction.userIdentity.create({
        data: {
          externalSubject: identity.externalSubject,
          provider: 'WECHAT_MINIPROGRAM',
          providerAppId: identity.providerAppId,
          unionId: identity.unionId ?? null,
          userId: user.id,
        },
      });

      return this.bindingRequired(transaction, user.id);
    });
  }

  private async bindingRequired(
    transaction: Prisma.TransactionClient,
    userId: string,
  ): Promise<WechatLoginResult> {
    const challenge = await this.challenges.issue(transaction, userId);

    return {
      bindingChallenge: challenge.token,
      bindingChallengeExpiresAt: challenge.expiresAt,
      kind: 'BINDING_REQUIRED',
    };
  }

  private lockKey(identity: WechatLoginIdentity): string {
    return `WECHAT_MINIPROGRAM:${identity.providerAppId}:${identity.externalSubject}`;
  }

  private recognized(userId: string, roles: readonly LoginRole[]): WechatLoginResult {
    return {
      kind: 'ACCOUNT_RECOGNIZED',
      requiresRoleSelection: roles.length > 1,
      roles,
      userId,
    };
  }
}
