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

export class LeaveImpactPreviewDto {
  @ApiProperty({ minimum: 0 })
  affectedAppointmentCount!: number;

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

  @ApiProperty({ enum: ['ACTIVE', 'CANCELLED'] })
  status!: string;
}
