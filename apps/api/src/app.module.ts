import { Module } from '@nestjs/common';

import { HealthController } from './health.controller';
import { MasterDataModule } from './master-data/master-data.module';

@Module({
  imports: [MasterDataModule],
  controllers: [HealthController],
})
export class AppModule {}
