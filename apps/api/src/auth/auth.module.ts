import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { DatabaseModule } from '../database/database.module';
import { RedisModule } from '../redis/redis.module';
import { AccessTokenGuard } from './access-token.guard';
import { AccessTokenService } from './access-token.service';
import { AccountBindingService } from './account-binding.service';
import { AuthController } from './auth.controller';
import { AuthFlowService } from './auth-flow.service';
import { AuthRateLimitService } from './auth-rate-limit.service';
import { AuthSessionService } from './auth-session.service';
import { AuthorizationPolicyService } from './authorization-policy.service';
import { BindingChallengeService } from './binding-challenge.service';
import { BindingCodeHasherService } from './binding-code-hasher.service';
import { BindingCodeIssuerService } from './binding-code-issuer.service';
import { BindingCodeVerifierService } from './binding-code-verifier.service';
import { OpaqueTokenService } from './opaque-token.service';
import { RoleSelectionChallengeService } from './role-selection-challenge.service';
import { WECHAT_LOGIN_ADAPTER } from './wechat-login.port';
import { WechatLoginService } from './wechat-login.service';
import { WechatMiniProgramAdapter } from './wechat-mini-program.adapter';

@Module({
  controllers: [AuthController],
  imports: [AuditModule, DatabaseModule, RedisModule],
  providers: [
    AccessTokenGuard,
    AccessTokenService,
    AccountBindingService,
    AuthFlowService,
    AuthRateLimitService,
    AuthSessionService,
    AuthorizationPolicyService,
    BindingChallengeService,
    BindingCodeHasherService,
    BindingCodeIssuerService,
    BindingCodeVerifierService,
    OpaqueTokenService,
    RoleSelectionChallengeService,
    WechatLoginService,
    { provide: WECHAT_LOGIN_ADAPTER, useClass: WechatMiniProgramAdapter },
  ],
  exports: [
    AccessTokenGuard,
    AccessTokenService,
    AccountBindingService,
    AuthFlowService,
    AuthRateLimitService,
    AuthSessionService,
    AuthorizationPolicyService,
    BindingChallengeService,
    BindingCodeHasherService,
    BindingCodeIssuerService,
    BindingCodeVerifierService,
    OpaqueTokenService,
    RoleSelectionChallengeService,
    WechatLoginService,
  ],
})
export class AuthModule {}
