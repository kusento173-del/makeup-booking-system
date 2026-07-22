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
