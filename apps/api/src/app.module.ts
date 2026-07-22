import { Module } from '@nestjs/common';

import { AvailabilityModule } from './availability/availability.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { BookingModule } from './booking/booking.module';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health.controller';
import { LeaveModule } from './leave/leave.module';
import { MasterDataModule } from './master-data/master-data.module';
import { OvertimeModule } from './overtime/overtime.module';
import { RedisModule } from './redis/redis.module';
import { ShiftModule } from './shift/shift.module';

@Module({
  imports: [
    AvailabilityModule,
    AuditModule,
    AuthModule,
    BookingModule,
    DatabaseModule,
    LeaveModule,
    MasterDataModule,
    OvertimeModule,
    RedisModule,
    ShiftModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
