import { Injectable } from '@nestjs/common';

import { AccountBindingService } from './account-binding.service';
import type { BindWechatAccountCommand, BoundWechatAccount } from './account-binding.types';
import { AuthSessionInvalidError } from './auth-session.errors';
import { AuthSessionService } from './auth-session.service';
import type { AuthFlowResult } from './auth-flow.types';
import { RoleSelectionChallengeService } from './role-selection-challenge.service';
import { WechatLoginService } from './wechat-login.service';
import type { RecognizedWechatAccount } from './wechat-login.types';

@Injectable()
export class AuthFlowService {
  constructor(
    private readonly bindings: AccountBindingService,
    private readonly roleSelections: RoleSelectionChallengeService,
    private readonly sessions: AuthSessionService,
    private readonly wechatLogin: WechatLoginService,
  ) {}

  async login(jsCode: string): Promise<AuthFlowResult> {
    const result = await this.wechatLogin.login(jsCode);
    return result.kind === 'BINDING_REQUIRED' ? result : this.completeVerifiedAccount(result);
  }

  async bind(command: BindWechatAccountCommand): Promise<AuthFlowResult> {
    return this.completeVerifiedAccount(await this.bindings.bind(command));
  }

  async selectRole(
    roleSelectionChallenge: string,
    roleAssignmentId: string,
  ): Promise<AuthFlowResult> {
    const userId = await this.roleSelections.consume(roleSelectionChallenge, roleAssignmentId);
    return {
      kind: 'SESSION_CREATED',
      session: await this.sessions.create(userId, roleAssignmentId),
    };
  }

  private async completeVerifiedAccount(
    account: RecognizedWechatAccount | BoundWechatAccount,
  ): Promise<AuthFlowResult> {
    if (account.roles.length === 1) {
      const role = account.roles[0];

      if (!role) {
        throw new AuthSessionInvalidError();
      }

      return {
        kind: 'SESSION_CREATED',
        session: await this.sessions.create(account.userId, role.roleAssignmentId),
      };
    }

    const challenge = await this.roleSelections.issue(account.userId);
    return {
      expiresAt: challenge.expiresAt,
      kind: 'ROLE_SELECTION_REQUIRED',
      roles: challenge.roles,
      roleSelectionChallenge: challenge.token,
    };
  }
}
