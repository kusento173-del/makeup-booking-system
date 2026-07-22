import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { MasterDataCreateService } from './master-data-create.service';
import { MasterDataCommandContextService } from './master-data-command-context.service';
import { MasterDataController } from './master-data.controller';
import { MasterDataNormalizationService } from './master-data-normalization.service';
import { MasterDataQueryService } from './master-data-query.service';
import { MasterDataUpdateService } from './master-data-update.service';

@Module({
  controllers: [MasterDataController],
  imports: [AuditModule, AuthModule, DatabaseModule],
  providers: [
    MasterDataCreateService,
    MasterDataCommandContextService,
    MasterDataNormalizationService,
    MasterDataQueryService,
    MasterDataUpdateService,
  ],
  exports: [
    MasterDataCreateService,
    MasterDataCommandContextService,
    MasterDataNormalizationService,
    MasterDataQueryService,
    MasterDataUpdateService,
  ],
})
export class MasterDataModule {}
