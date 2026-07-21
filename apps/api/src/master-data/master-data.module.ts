import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { MasterDataCreateService } from './master-data-create.service';
import { MasterDataNormalizationService } from './master-data-normalization.service';
import { MasterDataQueryService } from './master-data-query.service';

@Module({
  imports: [AuditModule, AuthModule, DatabaseModule],
  providers: [MasterDataCreateService, MasterDataNormalizationService, MasterDataQueryService],
  exports: [MasterDataCreateService, MasterDataNormalizationService, MasterDataQueryService],
})
export class MasterDataModule {}
