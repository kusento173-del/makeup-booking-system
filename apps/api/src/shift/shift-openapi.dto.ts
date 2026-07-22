import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SetInitialShiftRequestDto {
  @ApiPropertyOptional({ maximum: 1439, minimum: 0, nullable: true, type: Number })
  breakEndMinute?: number | null;

  @ApiPropertyOptional({ maximum: 1439, minimum: 0, nullable: true, type: Number })
  breakStartMinute?: number | null;

  @ApiProperty({ maximum: 1440, minimum: 15, multipleOf: 15, type: Number })
  workEndMinute!: number;

  @ApiProperty({ maximum: 1425, minimum: 0, multipleOf: 15, type: Number })
  workStartMinute!: number;

  @ApiProperty({ isArray: true, items: { maximum: 7, minimum: 1, type: 'integer' }, type: Number })
  workdays!: number[];
}

export class ArtistShiftDto {
  @ApiProperty({ format: 'uuid' })
  artistId!: string;

  @ApiProperty({ nullable: true, type: Number })
  breakEndMinute!: number | null;

  @ApiProperty({ nullable: true, type: Number })
  breakStartMinute!: number | null;

  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  siteId!: string;

  @ApiProperty({ format: 'date' })
  validFrom!: string;

  @ApiProperty({ format: 'date', nullable: true })
  validUntil!: string | null;

  @ApiProperty({ minimum: 1, type: Number })
  versionNo!: number;

  @ApiProperty({ type: Number })
  workEndMinute!: number;

  @ApiProperty({ type: Number })
  workStartMinute!: number;

  @ApiProperty({ isArray: true, type: Number })
  workdays!: number[];
}

export class SubmitShiftChangeRequestDto extends SetInitialShiftRequestDto {
  @ApiProperty({ format: 'date' })
  effectiveFrom!: string;

  @ApiProperty({ maxLength: 500 })
  reason!: string;
}

export class ShiftChangeDto extends SetInitialShiftRequestDto {
  @ApiProperty({ format: 'uuid' })
  artistId!: string;

  @ApiProperty({ format: 'date' })
  effectiveFrom!: string;

  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ maxLength: 500 })
  reason!: string;

  @ApiProperty({ minimum: 1 })
  rowVersion!: number;

  @ApiProperty({ format: 'uuid' })
  siteId!: string;

  @ApiProperty({ enum: ['APPROVED', 'PENDING', 'REJECTED', 'WITHDRAWN'] })
  status!: string;

  @ApiProperty({ format: 'date-time' })
  submittedAt!: string;
}

export class ShiftChangeListItemDto extends ShiftChangeDto {
  @ApiProperty()
  artistNickname!: string;

  @ApiProperty({ nullable: true })
  reviewComment!: string | null;

  @ApiProperty({ format: 'date-time', nullable: true })
  reviewedAt!: string | null;
}

export class ShiftChangePageDto {
  @ApiProperty({ isArray: true, type: ShiftChangeListItemDto })
  items!: ShiftChangeListItemDto[];

  @ApiProperty({ minimum: 1 })
  page!: number;

  @ApiProperty({ maximum: 100, minimum: 1 })
  pageSize!: number;

  @ApiProperty({ minimum: 0 })
  total!: number;
}

export class WithdrawShiftChangeRequestDto {
  @ApiProperty({ minimum: 1 })
  expectedRowVersion!: number;
}

export class ReviewShiftChangeRequestDto extends WithdrawShiftChangeRequestDto {
  @ApiPropertyOptional({ maxLength: 500 })
  comment?: string;

  @ApiProperty({ enum: ['APPROVE', 'REJECT'] })
  decision!: string;
}
