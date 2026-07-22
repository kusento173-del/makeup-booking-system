import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { DatabaseModule } from '../database/database.module';
import { AuthorizationPolicyService } from './authorization-policy.service';
import { BindingCodeHasherService } from './binding-code-hasher.service';
import { BindingCodeIssuerService } from './binding-code-issuer.service';
import { BindingCodeVerifierService } from './binding-code-verifier.service';

@Module({
  imports: [AuditModule, DatabaseModule],
  providers: [
    AuthorizationPolicyService,
    BindingCodeHasherService,
    BindingCodeIssuerService,
    BindingCodeVerifierService,
  ],
  exports: [
    AuthorizationPolicyService,
    BindingCodeHasherService,
    BindingCodeIssuerService,
    BindingCodeVerifierService,
  ],
})
export class AuthModule {}
