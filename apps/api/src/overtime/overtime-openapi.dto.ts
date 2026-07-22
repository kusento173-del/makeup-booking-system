import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class OvertimeRequestDto {
  @ApiPropertyOptional({ maximum: 1439, minimum: 0, nullable: true, type: Number })
  breakEndMinute?: number | null;

  @ApiPropertyOptional({ maximum: 1439, minimum: 0, nullable: true, type: Number })
  breakStartMinute?: number | null;

  @ApiProperty({ format: 'date' })
  overtimeDate!: string;

  @ApiProperty({ maxLength: 500 })
  reason!: string;

  @ApiProperty({ maximum: 1440, minimum: 15, multipleOf: 15, type: Number })
  workEndMinute!: number;

  @ApiProperty({ maximum: 1425, minimum: 0, multipleOf: 15, type: Number })
  workStartMinute!: number;
}

export class OvertimeSummaryDto extends OvertimeRequestDto {
  @ApiProperty({ minimum: 0 })
  affectedAppointmentCount!: number;

  @ApiProperty({ format: 'uuid' })
  artistId!: string;

  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ minimum: 1 })
  rowVersion!: number;

  @ApiProperty({ format: 'uuid' })
  siteId!: string;

  @ApiProperty({ enum: ['APPROVED', 'PENDING', 'REJECTED', 'WITHDRAWN'] })
  status!: string;

  @ApiProperty({ format: 'date-time' })
  submittedAt!: string;
}

export class OvertimeListItemDto extends OvertimeSummaryDto {
  @ApiProperty()
  artistNickname!: string;

  @ApiProperty({ maxLength: 500, nullable: true })
  reviewComment!: string | null;

  @ApiProperty({ format: 'date-time', nullable: true })
  reviewedAt!: string | null;
}

export class OvertimePageDto {
  @ApiProperty({ isArray: true, type: OvertimeListItemDto })
  items!: OvertimeListItemDto[];

  @ApiProperty({ minimum: 1 })
  page!: number;

  @ApiProperty({ maximum: 100, minimum: 1 })
  pageSize!: number;

  @ApiProperty({ minimum: 0 })
  total!: number;
}

export class WithdrawOvertimeRequestDto {
  @ApiProperty({ minimum: 1 })
  expectedRowVersion!: number;
}

export class ReviewOvertimeRequestDto extends WithdrawOvertimeRequestDto {
  @ApiPropertyOptional({ maxLength: 500 })
  comment?: string;

  @ApiProperty({ enum: ['APPROVE', 'REJECT'] })
  decision!: string;
}
