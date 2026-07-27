import { Injectable } from '@nestjs/common';

import { AccountBindingService } from './account-binding.service';
import type { BindWechatAccountCommand } from './account-binding.types';
import { AuthSessionInvalidError } from './auth-session.errors';
import { AuthSessionService } from './auth-session.service';
import type { AuthFlowResult } from './auth-flow.types';
import { PasswordChangeChallengeService } from './password-change-challenge.service';
import { RoleSelectionChallengeService } from './role-selection-challenge.service';
import { WechatLoginService } from './wechat-login.service';
import type { LoginRole } from './wechat-login.types';

interface VerifiedAccount {
  readonly mustChangePassword?: boolean;
  readonly roles: readonly LoginRole[];
  readonly userId: string;
}

@Injectable()
export class AuthFlowService {
  constructor(
    private readonly bindings: AccountBindingService,
    private readonly roleSelections: RoleSelectionChallengeService,
    private readonly sessions: AuthSessionService,
    private readonly wechatLogin: WechatLoginService,
    private readonly passwordChanges: PasswordChangeChallengeService,
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

  async completeVerifiedAccount(account: VerifiedAccount): Promise<AuthFlowResult> {
    if (account.mustChangePassword) {
      const challenge = await this.passwordChanges.issue(account.userId);
      return {
        expiresAt: challenge.expiresAt,
        kind: 'PASSWORD_CHANGE_REQUIRED',
        passwordChangeChallenge: challenge.token,
      };
    }

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
