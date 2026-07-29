import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class BookingSlotDto {
  @ApiProperty({ format: 'date-time' })
  endAt!: string;

  @ApiProperty({ format: 'date-time' })
  startAt!: string;

  @ApiProperty({ maximum: 1425, minimum: 0, multipleOf: 15 })
  startMinute!: number;

  @ApiProperty({ format: 'date', isArray: true, type: String })
  unavailablePeriodConflictDates!: string[];
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

export class FixedAvailabilitySlotDto {
  @ApiProperty()
  available!: boolean;

  @ApiProperty({ format: 'date', nullable: true })
  earliestStartDate!: string | null;

  @ApiProperty({ maximum: 1440, minimum: 15, multipleOf: 15 })
  endMinute!: number;

  @ApiProperty({ isArray: true, maximum: 7, minimum: 1, type: Number })
  fixedConflictWeekdays!: number[];

  @ApiProperty({ format: 'date', isArray: true, type: String })
  singleConflictDates!: string[];

  @ApiProperty({ maximum: 1425, minimum: 0, multipleOf: 15 })
  startMinute!: number;
}

export class FixedAvailabilityResultDto {
  @ApiProperty({ format: 'uuid' })
  artistId!: string;

  @ApiProperty({ format: 'date', isArray: true, type: String })
  artistLeaveDates!: string[];

  @ApiProperty({ enum: [15, 30, 45, 60] })
  durationMinutes!: number;

  @ApiProperty({ format: 'uuid' })
  hostId!: string;

  @ApiProperty({ format: 'date', isArray: true, type: String })
  hostLeaveDates!: string[];

  @ApiProperty({ format: 'date' })
  requestedStartDate!: string;

  @ApiProperty({ isArray: true, type: FixedAvailabilitySlotDto })
  slots!: FixedAvailabilitySlotDto[];

  @ApiProperty({
    enum: [
      'ARTIST_INACTIVE',
      'HOST_HAS_ACTIVE_FIXED_RULE',
      'HOST_HAS_PENDING_FIXED_REQUEST',
      'HOST_INELIGIBLE',
      'NO_STABLE_TIME_SLOT',
      'NON_WORKING_WEEKDAY',
      'SHIFT_NOT_CONFIGURED',
      'SITE_INACTIVE',
    ],
    nullable: true,
  })
  unavailableReason!: string | null;

  @ApiProperty({ isArray: true, maximum: 7, minimum: 1, type: Number })
  weekdays!: number[];
}

export class CreateFixedRequestDto {
  @ApiProperty({ format: 'uuid' })
  artistId!: string;

  @ApiProperty({ enum: [15, 30, 45, 60] })
  durationMinutes!: number;

  @ApiProperty({ format: 'date' })
  effectiveFrom!: string;

  @ApiProperty({ format: 'uuid' })
  hostId!: string;

  @ApiProperty({ maxLength: 500 })
  reason!: string;

  @ApiProperty({ maximum: 1425, minimum: 0, multipleOf: 15 })
  startMinute!: number;

  @ApiProperty({ isArray: true, maximum: 7, minimum: 1, type: Number })
  weekdays!: number[];
}

export class ChangeFixedRequestDto extends CreateFixedRequestDto {
  @ApiProperty({ format: 'uuid' })
  currentRuleId!: string;
}

export class CancelFixedRequestDto {
  @ApiProperty({ format: 'uuid' })
  currentRuleId!: string;

  @ApiProperty({ format: 'date' })
  effectiveFrom!: string;

  @ApiProperty({ format: 'uuid' })
  hostId!: string;

  @ApiProperty({ maxLength: 500 })
  reason!: string;
}

export class FixedRequestSummaryDto {
  @ApiProperty({ format: 'uuid', nullable: true })
  currentRuleId!: string | null;

  @ApiProperty({ format: 'date' })
  effectiveFrom!: string;

  @ApiProperty({ format: 'uuid' })
  hostId!: string;

  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  reason!: string;

  @ApiProperty({ enum: ['CANCEL', 'CHANGE', 'CREATE'] })
  requestType!: string;

  @ApiProperty({ minimum: 1 })
  rowVersion!: number;

  @ApiProperty({ format: 'uuid' })
  siteId!: string;

  @ApiProperty({ enum: ['PENDING'] })
  status!: string;

  @ApiProperty({ format: 'date-time' })
  submittedAt!: string;

  @ApiProperty({ format: 'uuid' })
  submittedByOperatorId!: string;

  @ApiProperty({ format: 'uuid', nullable: true })
  targetArtistId!: string | null;

  @ApiProperty({ enum: [15, 30, 45, 60], nullable: true })
  targetDurationMinutes!: number | null;

  @ApiProperty({ maximum: 1425, minimum: 0, multipleOf: 15, nullable: true })
  targetStartMinute!: number | null;

  @ApiProperty({ isArray: true, maximum: 7, minimum: 1, type: Number })
  targetWeekdays!: number[];
}

export class FixedRequestCreateResultDto {
  @ApiProperty()
  replayed!: boolean;

  @ApiProperty({ type: FixedRequestSummaryDto })
  request!: FixedRequestSummaryDto;
}

export class FixedRequestListItemDto {
  @ApiProperty({ format: 'uuid', nullable: true })
  currentRuleId!: string | null;

  @ApiProperty({ format: 'date' })
  effectiveFrom!: string;

  @ApiProperty()
  hostCode!: string;

  @ApiProperty({ format: 'uuid' })
  hostId!: string;

  @ApiProperty()
  hostName!: string;

  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  reason!: string;

  @ApiProperty({ enum: ['CANCEL', 'CHANGE', 'CREATE'] })
  requestType!: string;

  @ApiProperty({ nullable: true })
  reviewComment!: string | null;

  @ApiProperty({ format: 'date-time', nullable: true })
  reviewedAt!: string | null;

  @ApiProperty({ minimum: 1 })
  rowVersion!: number;

  @ApiProperty({ format: 'uuid' })
  siteId!: string;

  @ApiProperty()
  siteName!: string;

  @ApiProperty({ enum: ['APPROVED', 'PENDING', 'REJECTED', 'WITHDRAWN'] })
  status!: string;

  @ApiProperty({ format: 'date-time' })
  submittedAt!: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  submittedByOperatorId!: string | null;

  @ApiProperty()
  submittedByOperatorName!: string;

  @ApiProperty({ format: 'uuid', nullable: true })
  targetArtistId!: string | null;

  @ApiProperty({ nullable: true })
  targetArtistNickname!: string | null;

  @ApiProperty({ enum: [15, 30, 45, 60], nullable: true })
  targetDurationMinutes!: number | null;

  @ApiProperty({ maximum: 1425, minimum: 0, multipleOf: 15, nullable: true })
  targetStartMinute!: number | null;

  @ApiProperty({ isArray: true, maximum: 7, minimum: 1, type: Number })
  targetWeekdays!: number[];
}

export class FixedRequestPageDto {
  @ApiProperty({ isArray: true, type: FixedRequestListItemDto })
  items!: FixedRequestListItemDto[];

  @ApiProperty({ minimum: 1 })
  page!: number;

  @ApiProperty({ maximum: 100, minimum: 1 })
  pageSize!: number;

  @ApiProperty({ minimum: 0 })
  total!: number;
}

export class FixedRuleListItemDto {
  @ApiProperty({ format: 'uuid' })
  artistId!: string;

  @ApiProperty()
  artistNickname!: string;

  @ApiProperty({ enum: [15, 30, 45, 60] })
  durationMinutes!: number;

  @ApiProperty()
  hostCode!: string;

  @ApiProperty({ format: 'uuid' })
  hostId!: string;

  @ApiProperty()
  hostName!: string;

  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  siteId!: string;

  @ApiProperty()
  siteName!: string;

  @ApiProperty({ maximum: 1425, minimum: 0, multipleOf: 15 })
  startMinute!: number;

  @ApiProperty({ enum: ['ACTIVE', 'ENDED'] })
  status!: string;

  @ApiProperty({ format: 'date' })
  validFrom!: string;

  @ApiProperty({ format: 'date', nullable: true })
  validUntil!: string | null;

  @ApiProperty({ isArray: true, maximum: 7, minimum: 1, type: Number })
  weekdays!: number[];
}

export class FixedRulePageDto {
  @ApiProperty({ isArray: true, type: FixedRuleListItemDto })
  items!: FixedRuleListItemDto[];

  @ApiProperty({ minimum: 1 })
  page!: number;

  @ApiProperty({ maximum: 100, minimum: 1 })
  pageSize!: number;

  @ApiProperty({ minimum: 0 })
  total!: number;
}

export class ReviewFixedRequestDto {
  @ApiPropertyOptional({ maxLength: 500 })
  comment?: string;

  @ApiProperty({ enum: ['APPROVE', 'REJECT'] })
  decision!: string;

  @ApiProperty({ minimum: 1 })
  expectedRowVersion!: number;
}

export class FixedRequestReviewResultDto {
  @ApiProperty({ minimum: 0 })
  cancelledAppointmentCount!: number;

  @ApiProperty({ format: 'uuid', nullable: true })
  fixedRuleId!: string | null;

  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ nullable: true })
  reviewComment!: string | null;

  @ApiProperty({ format: 'date-time' })
  reviewedAt!: string;

  @ApiProperty({ minimum: 2 })
  rowVersion!: number;

  @ApiProperty({ enum: ['APPROVED', 'REJECTED'] })
  status!: string;
}

export class ActiveFixedRuleSummaryDto {
  @ApiProperty({ format: 'uuid' })
  artistId!: string;

  @ApiProperty()
  artistNickname!: string;

  @ApiProperty({ enum: [15, 30, 45, 60] })
  durationMinutes!: number;

  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ minimum: 1 })
  rowVersion!: number;

  @ApiProperty({ maximum: 1425, minimum: 0, multipleOf: 15 })
  startMinute!: number;

  @ApiProperty({ format: 'date' })
  validFrom!: string;

  @ApiProperty({ isArray: true, maximum: 7, minimum: 1, type: Number })
  weekdays!: number[];
}

export class PendingFixedRequestSummaryDto {
  @ApiProperty({ format: 'date' })
  effectiveFrom!: string;

  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: ['CANCEL', 'CHANGE', 'CREATE'] })
  requestType!: string;

  @ApiProperty({ minimum: 1 })
  rowVersion!: number;

  @ApiProperty({ format: 'uuid', nullable: true })
  targetArtistId!: string | null;

  @ApiProperty({ enum: [15, 30, 45, 60], nullable: true })
  targetDurationMinutes!: number | null;

  @ApiProperty({ maximum: 1425, minimum: 0, multipleOf: 15, nullable: true })
  targetStartMinute!: number | null;

  @ApiProperty({ isArray: true, maximum: 7, minimum: 1, type: Number })
  targetWeekdays!: number[];
}

export class FixedHostStateDto {
  @ApiProperty({ nullable: true, type: ActiveFixedRuleSummaryDto })
  activeRule!: ActiveFixedRuleSummaryDto | null;

  @ApiProperty({ format: 'uuid' })
  hostId!: string;

  @ApiProperty({ nullable: true, type: PendingFixedRequestSummaryDto })
  pendingRequest!: PendingFixedRequestSummaryDto | null;

  @ApiProperty({ format: 'uuid' })
  siteId!: string;
}

export class ManagedHostSummaryDto {
  @ApiProperty({ nullable: true, type: ActiveFixedRuleSummaryDto })
  activeRule!: ActiveFixedRuleSummaryDto | null;

  @ApiProperty({
    enum: ['AVAILABLE', 'ON_LEAVE', 'QUALIFICATION_BLOCKED', 'SITE_INACTIVE'],
  })
  bookingAvailability!: string;

  @ApiProperty()
  hostCode!: string;

  @ApiProperty({ format: 'uuid' })
  hostId!: string;

  @ApiProperty()
  hostName!: string;

  @ApiProperty({ nullable: true, type: PendingFixedRequestSummaryDto })
  pendingRequest!: PendingFixedRequestSummaryDto | null;

  @ApiProperty({ enum: ['ACTIVE', 'CANCELLED'] })
  qualificationStatus!: string;

  @ApiProperty({ format: 'uuid' })
  siteId!: string;

  @ApiProperty()
  siteName!: string;
}

export class ManagedHostPageDto {
  @ApiProperty({ isArray: true, type: ManagedHostSummaryDto })
  items!: ManagedHostSummaryDto[];

  @ApiProperty({ minimum: 1 })
  page!: number;

  @ApiProperty({ maximum: 100, minimum: 1 })
  pageSize!: number;

  @ApiProperty({ minimum: 0 })
  total!: number;
}

export class MyFixedRelationSummaryDto {
  @ApiProperty({ format: 'uuid' })
  artistId!: string;

  @ApiProperty()
  artistNickname!: string;

  @ApiProperty({ enum: [15, 30, 45, 60] })
  durationMinutes!: number;

  @ApiProperty()
  hostCode!: string;

  @ApiProperty({ format: 'uuid' })
  hostId!: string;

  @ApiProperty()
  hostName!: string;

  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  siteId!: string;

  @ApiProperty()
  siteName!: string;

  @ApiProperty({ maximum: 1425, minimum: 0, multipleOf: 15 })
  startMinute!: number;

  @ApiProperty({ format: 'date' })
  validFrom!: string;

  @ApiProperty({ format: 'date', nullable: true })
  validUntil!: string | null;

  @ApiProperty({ isArray: true, maximum: 7, minimum: 1, type: Number })
  weekdays!: number[];
}

export class WithdrawFixedRequestDto {
  @ApiProperty({ minimum: 1 })
  expectedRowVersion!: number;
}

export class FixedRequestWithdrawResultDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ minimum: 2 })
  rowVersion!: number;

  @ApiProperty({ enum: ['WITHDRAWN'] })
  status!: string;
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

  @ApiPropertyOptional({ description: '客服或管理员代录时必填', maxLength: 500 })
  reason?: string;

  @ApiProperty({ maximum: 1425, minimum: 0, multipleOf: 15 })
  startMinute!: number;
}

export class AppointmentSummaryDto {
  @ApiProperty({ enum: ['FIXED', 'SINGLE'] })
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

export class CancelBookingRequestDto {
  @ApiProperty({ minimum: 1 })
  expectedRowVersion!: number;

  @ApiPropertyOptional({ maxLength: 500 })
  reason?: string;
}

export class BookingCancellationResultDto {
  @ApiProperty({ format: 'date-time' })
  cancelledAt!: string;

  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ minimum: 2 })
  rowVersion!: number;

  @ApiProperty({ enum: ['CANCELLED'] })
  status!: string;
}

export class RescheduleBookingRequestDto {
  @ApiProperty({ format: 'uuid' })
  artistId!: string;

  @ApiPropertyOptional({ default: false })
  confirmedSecondBooking?: boolean;

  @ApiProperty({ format: 'date' })
  date!: string;

  @ApiProperty({ enum: [15, 30, 45, 60] })
  durationMinutes!: number;

  @ApiProperty({ minimum: 1 })
  expectedRowVersion!: number;

  @ApiPropertyOptional({ maxLength: 500 })
  reason?: string;

  @ApiProperty({ maximum: 1425, minimum: 0, multipleOf: 15 })
  startMinute!: number;
}

export class BookingRescheduleResultDto {
  @ApiProperty({ type: AppointmentSummaryDto })
  appointment!: AppointmentSummaryDto;

  @ApiProperty({ type: BookingCancellationResultDto })
  original!: BookingCancellationResultDto;

  @ApiProperty()
  replayed!: boolean;
}

export class AppointmentListItemDto extends AppointmentSummaryDto {
  @ApiProperty({ format: 'uuid', nullable: true })
  rescheduledFromAppointmentId!: string | null;
}

export class AppointmentPageDto {
  @ApiProperty({ isArray: true, type: AppointmentListItemDto })
  items!: AppointmentListItemDto[];

  @ApiProperty({ minimum: 1 })
  page!: number;

  @ApiProperty({ maximum: 100, minimum: 1 })
  pageSize!: number;

  @ApiProperty({ minimum: 0 })
  total!: number;
}
