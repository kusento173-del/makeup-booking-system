import { ApiProperty } from '@nestjs/swagger';

export class ScheduleMinuteIntervalDto {
  @ApiProperty({ maximum: 1440, minimum: 15, multipleOf: 15 })
  endMinute!: number;

  @ApiProperty({ maximum: 1425, minimum: 0, multipleOf: 15 })
  startMinute!: number;
}

export class ScheduleAppointmentItemDto {
  @ApiProperty({ enum: ['FIXED', 'SINGLE'] })
  appointmentType!: string;

  @ApiProperty({ enum: ['主播取消', '主播请假', '化妆师请假'], nullable: true })
  cancellationReason!: string | null;

  @ApiProperty({ maxLength: 500, nullable: true })
  cancellationReasonText!: string | null;

  @ApiProperty({ enum: [1, 2] })
  dailySequence!: number;

  @ApiProperty({ enum: [15, 30, 45, 60] })
  durationMinutes!: number;

  @ApiProperty({ format: 'date-time' })
  endAt!: string;

  @ApiProperty({ maximum: 1440, minimum: 15, multipleOf: 15 })
  endMinute!: number;

  @ApiProperty()
  hostCode!: string;

  @ApiProperty({ format: 'uuid' })
  hostId!: string;

  @ApiProperty()
  hostName!: string;

  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid', nullable: true })
  operatorId!: string | null;

  @ApiProperty({ nullable: true })
  operatorName!: string | null;

  @ApiProperty({ minimum: 1 })
  rowVersion!: number;

  @ApiProperty({ format: 'date-time' })
  startAt!: string;

  @ApiProperty({ maximum: 1425, minimum: 0, multipleOf: 15 })
  startMinute!: number;

  @ApiProperty({ enum: ['BOOKED', 'CANCELLED', 'COMPLETED'] })
  status!: string;
}

export class ScheduleArtistRowDto {
  @ApiProperty({ isArray: true, type: ScheduleAppointmentItemDto })
  appointments!: ScheduleAppointmentItemDto[];

  @ApiProperty({ format: 'uuid' })
  artistId!: string;

  @ApiProperty()
  artistNickname!: string;

  @ApiProperty({ enum: ['APPROVED_OVERTIME', 'REGULAR_SHIFT'], nullable: true })
  availabilitySource!: string | null;

  @ApiProperty()
  available!: boolean;

  @ApiProperty({ nullable: true, type: ScheduleMinuteIntervalDto })
  breakInterval!: ScheduleMinuteIntervalDto | null;

  @ApiProperty({ isArray: true, type: ScheduleMinuteIntervalDto })
  unavailablePeriods!: ScheduleMinuteIntervalDto[];

  @ApiProperty({ isArray: true, type: ScheduleMinuteIntervalDto })
  workIntervals!: ScheduleMinuteIntervalDto[];

  @ApiProperty({
    enum: [
      'ARTIST_INACTIVE',
      'ARTIST_ON_LEAVE',
      'NON_WORKING_DAY',
      'SHIFT_NOT_CONFIGURED',
      'SITE_INACTIVE',
    ],
    nullable: true,
  })
  unavailableReason!: string | null;
}

export class ScheduleBoardDto {
  @ApiProperty({ isArray: true, type: ScheduleArtistRowDto })
  artists!: ScheduleArtistRowDto[];

  @ApiProperty({ format: 'date' })
  date!: string;

  @ApiProperty({ format: 'date-time' })
  lastUpdatedAt!: string;

  @ApiProperty({ format: 'uuid' })
  siteId!: string;

  @ApiProperty()
  siteName!: string;
}
