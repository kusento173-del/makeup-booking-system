import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LeavePreviewRequestDto {
  @ApiProperty({ format: 'date' })
  endDate!: string;

  @ApiProperty({ format: 'date' })
  startDate!: string;
}

export class CreateLeaveRequestDto extends LeavePreviewRequestDto {
  @ApiProperty({ minimum: 0 })
  confirmedAffectedAppointmentCount!: number;

  @ApiPropertyOptional({ maxLength: 500 })
  reason?: string;
}

export class CancelLeaveRequestDto {
  @ApiProperty({ minimum: 1 })
  expectedRowVersion!: number;

  @ApiPropertyOptional({ maxLength: 500 })
  reason?: string;
}

export class ReviewLeaveRequestDto {
  @ApiPropertyOptional({ maxLength: 500 })
  comment?: string;

  @ApiProperty({ minimum: 0 })
  confirmedAffectedAppointmentCount!: number;

  @ApiProperty({ enum: ['APPROVE', 'REJECT'] })
  decision!: string;

  @ApiProperty({ minimum: 1 })
  expectedRowVersion!: number;
}

export class AffectedAppointmentDto {
  @ApiProperty({ format: 'date' })
  appointmentDate!: string;

  @ApiProperty({ enum: ['FIXED', 'SINGLE'] })
  appointmentType!: string;

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

  @ApiProperty({ format: 'date-time' })
  startAt!: string;
}

export class LeaveImpactPreviewDto {
  @ApiProperty({ minimum: 0 })
  affectedAppointmentCount!: number;

  @ApiProperty({ type: [AffectedAppointmentDto] })
  affectedAppointments!: AffectedAppointmentDto[];

  @ApiProperty({ format: 'date' })
  endDate!: string;

  @ApiProperty({ format: 'date' })
  startDate!: string;

  @ApiProperty({ format: 'uuid' })
  subjectId!: string;

  @ApiProperty({ enum: ['ARTIST', 'HOST'] })
  subjectType!: string;
}

export class LeaveSummaryDto extends LeaveImpactPreviewDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ maxLength: 500, nullable: true })
  reason!: string | null;

  @ApiProperty({ minimum: 1 })
  rowVersion!: number;

  @ApiProperty({ maxLength: 500, nullable: true })
  reviewComment!: string | null;

  @ApiProperty({ enum: ['ACTIVE', 'CANCELLED', 'PENDING', 'REJECTED'] })
  status!: string;
}

export class LeaveApprovalItemDto extends LeaveSummaryDto {
  @ApiProperty()
  artistNickname!: string;

  @ApiProperty({ format: 'uuid' })
  siteId!: string;

  @ApiProperty({ format: 'date-time' })
  submittedAt!: string;
}

export class LeaveReviewedItemDto extends LeaveApprovalItemDto {
  @ApiProperty({ format: 'date-time' })
  reviewedAt!: string;
}
