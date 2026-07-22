import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { ScheduleBoardController } from './schedule-board.controller';
import { ScheduleBoardService } from './schedule-board.service';

@Module({
  controllers: [ScheduleBoardController],
  exports: [ScheduleBoardService],
  imports: [AuthModule, DatabaseModule],
  providers: [ScheduleBoardService],
})
export class ScheduleModule {}
