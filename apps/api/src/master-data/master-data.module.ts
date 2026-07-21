import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';
import { MasterDataNormalizationService } from './master-data-normalization.service';
import { MasterDataQueryService } from './master-data-query.service';

@Module({
  imports: [DatabaseModule],
  providers: [MasterDataNormalizationService, MasterDataQueryService],
  exports: [MasterDataNormalizationService, MasterDataQueryService],
})
export class MasterDataModule {}
