import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class BookingSlotDto {
  @ApiProperty({ format: 'date-time' })
  endAt!: string;

  @ApiProperty({ format: 'date-time' })
  startAt!: string;

  @ApiProperty({ maximum: 1425, minimum: 0, multipleOf: 15 })
  startMinute!: number;
}

export class BookingSlotResultDto {
  @ApiProperty({ format: 'uuid' })
  artistId!: string;

  @ApiProperty({ enum: ['APPROVED_OVERTIME', 'REGULAR_SHIFT'], nullable: true })
  availabilitySource!: string | null;

  @ApiProperty({ format: 'date' })
  date!: string;

  @ApiProperty({ enum: [15, 30, 45, 60] })
  durationMinutes!: number;

  @ApiProperty({ maximum: 2, minimum: 0 })
  existingAppointmentCount!: number;

  @ApiProperty({ format: 'uuid' })
  hostId!: string;

  @ApiProperty()
  requiresSecondConfirmation!: boolean;

  @ApiProperty({ isArray: true, type: BookingSlotDto })
  slots!: BookingSlotDto[];

  @ApiProperty({
    enum: [
      'ARTIST_INACTIVE',
      'ARTIST_ON_LEAVE',
      'HOST_DAILY_LIMIT_REACHED',
      'HOST_INELIGIBLE',
      'HOST_ON_LEAVE',
      'HOST_SITE_INACTIVE',
      'NON_WORKING_DAY',
      'SHIFT_NOT_CONFIGURED',
      'SITE_INACTIVE',
    ],
    nullable: true,
  })
  unavailableReason!: string | null;
}

export class CreateBookingRequestDto {
  @ApiProperty({ format: 'uuid' })
  artistId!: string;

  @ApiPropertyOptional({ default: false })
  confirmedSecondBooking?: boolean;

  @ApiProperty({ format: 'date' })
  date!: string;

  @ApiProperty({ enum: [15, 30, 45, 60] })
  durationMinutes!: number;

  @ApiProperty({ format: 'uuid' })
  hostId!: string;

  @ApiProperty({ maximum: 1425, minimum: 0, multipleOf: 15 })
  startMinute!: number;
}

export class AppointmentSummaryDto {
  @ApiProperty({ enum: ['SINGLE'] })
  appointmentType!: string;

  @ApiProperty({ format: 'uuid' })
  artistId!: string;

  @ApiProperty()
  artistNickname!: string;

  @ApiProperty({ enum: [1, 2] })
  dailySequence!: number;

  @ApiProperty({ format: 'date' })
  date!: string;

  @ApiProperty({ enum: [15, 30, 45, 60] })
  durationMinutes!: number;

  @ApiProperty({ format: 'date-time' })
  endAt!: string;

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

  @ApiProperty({ format: 'uuid' })
  siteId!: string;

  @ApiProperty()
  siteName!: string;

  @ApiProperty({ format: 'date-time' })
  startAt!: string;

  @ApiProperty({ enum: ['BOOKED', 'CANCELLED', 'COMPLETED'] })
  status!: string;
}

export class BookingCreateResultDto {
  @ApiProperty({ type: AppointmentSummaryDto })
  appointment!: AppointmentSummaryDto;

  @ApiProperty()
  replayed!: boolean;
}
