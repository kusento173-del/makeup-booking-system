import { Module } from '@nestjs/common';

import { MasterDataNormalizationService } from './master-data-normalization.service';

@Module({
  providers: [MasterDataNormalizationService],
  exports: [MasterDataNormalizationService],
})
export class MasterDataModule {}
