import { Module } from '@nestjs/common';

import { AvailabilityModule } from './availability/availability.module';
import { AuditModule } from './audit/audit.module';
import { AuditQueryModule } from './audit/audit-query.module';
import { AuthModule } from './auth/auth.module';
import { BookingModule } from './booking/booking.module';
import { DatabaseModule } from './database/database.module';
import { ExportModule } from './export/export.module';
import { HealthController } from './health.controller';
import { LeaveModule } from './leave/leave.module';
import { MasterDataModule } from './master-data/master-data.module';
import { OvertimeModule } from './overtime/overtime.module';
import { RedisModule } from './redis/redis.module';
import { ScheduleModule } from './schedule/schedule.module';
import { ShiftModule } from './shift/shift.module';
import { ArtistUnavailabilityModule } from './unavailability/artist-unavailability.module';

@Module({
  imports: [
    AvailabilityModule,
    AuditModule,
    AuditQueryModule,
    AuthModule,
    BookingModule,
    DatabaseModule,
    ExportModule,
    LeaveModule,
    MasterDataModule,
    OvertimeModule,
    RedisModule,
    ScheduleModule,
    ShiftModule,
    ArtistUnavailabilityModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
