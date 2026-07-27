import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { DatabaseModule } from '../database/database.module';
import { RedisModule } from '../redis/redis.module';
import { AccessTokenGuard } from './access-token.guard';
import { AccessTokenService } from './access-token.service';
import { AuthController } from './auth.controller';
import { AuthFlowService } from './auth-flow.service';
import { AuthRateLimitService } from './auth-rate-limit.service';
import { AuthSessionService } from './auth-session.service';
import { AuthorizationPolicyService } from './authorization-policy.service';
import { BackofficeLoginService } from './backoffice-login.service';
import { BackofficePasswordService } from './backoffice-password.service';
import { OpaqueTokenService } from './opaque-token.service';
import { PasswordHasherService } from './password-hasher.service';
import { PasswordChangeChallengeService } from './password-change-challenge.service';
import { RoleSelectionChallengeService } from './role-selection-challenge.service';

@Module({
  controllers: [AuthController],
  imports: [AuditModule, DatabaseModule, RedisModule],
  providers: [
    AccessTokenGuard,
    AccessTokenService,
    AuthFlowService,
    AuthRateLimitService,
    AuthSessionService,
    AuthorizationPolicyService,
    BackofficeLoginService,
    BackofficePasswordService,
    OpaqueTokenService,
    PasswordHasherService,
    PasswordChangeChallengeService,
    RoleSelectionChallengeService,
  ],
  exports: [
    AccessTokenGuard,
    AccessTokenService,
    AuthFlowService,
    AuthRateLimitService,
    AuthSessionService,
    AuthorizationPolicyService,
    BackofficeLoginService,
    BackofficePasswordService,
    OpaqueTokenService,
    PasswordHasherService,
    PasswordChangeChallengeService,
    RoleSelectionChallengeService,
  ],
})
export class AuthModule {}
