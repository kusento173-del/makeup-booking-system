import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { DatabaseModule } from '../database/database.module';
import { AccountBindingService } from './account-binding.service';
import { AuthorizationPolicyService } from './authorization-policy.service';
import { BindingChallengeService } from './binding-challenge.service';
import { BindingCodeHasherService } from './binding-code-hasher.service';
import { BindingCodeIssuerService } from './binding-code-issuer.service';
import { BindingCodeVerifierService } from './binding-code-verifier.service';
import { OpaqueTokenService } from './opaque-token.service';
import { WECHAT_LOGIN_ADAPTER } from './wechat-login.port';
import { WechatLoginService } from './wechat-login.service';
import { WechatMiniProgramAdapter } from './wechat-mini-program.adapter';

@Module({
  imports: [AuditModule, DatabaseModule],
  providers: [
    AccountBindingService,
    AuthorizationPolicyService,
    BindingChallengeService,
    BindingCodeHasherService,
    BindingCodeIssuerService,
    BindingCodeVerifierService,
    OpaqueTokenService,
    WechatLoginService,
    { provide: WECHAT_LOGIN_ADAPTER, useClass: WechatMiniProgramAdapter },
  ],
  exports: [
    AccountBindingService,
    AuthorizationPolicyService,
    BindingChallengeService,
    BindingCodeHasherService,
    BindingCodeIssuerService,
    BindingCodeVerifierService,
    OpaqueTokenService,
    WechatLoginService,
  ],
})
export class AuthModule {}
