import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { MasterDataAuditService } from './master-data-audit.service';
import { MasterDataCreateService } from './master-data-create.service';
import { MasterDataNormalizationService } from './master-data-normalization.service';
import { MasterDataQueryService } from './master-data-query.service';
import { MasterDataUpdateService } from './master-data-update.service';

@Module({
  imports: [AuditModule, AuthModule, DatabaseModule],
  providers: [
    MasterDataAuditService,
    MasterDataCreateService,
    MasterDataNormalizationService,
    MasterDataQueryService,
    MasterDataUpdateService,
  ],
  exports: [
    MasterDataCreateService,
    MasterDataNormalizationService,
    MasterDataQueryService,
    MasterDataUpdateService,
  ],
})
export class MasterDataModule {}
