import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ArtistUnavailablePeriodRangeDto {
  @ApiPropertyOptional({ format: 'uuid' })
  artistId?: string;

  @ApiProperty({ maximum: 1440, minimum: 15, multipleOf: 15 })
  endMinute!: number;

  @ApiProperty({ maximum: 1425, minimum: 0, multipleOf: 15 })
  startMinute!: number;

  @ApiProperty({ format: 'date' })
  unavailableDate!: string;
}

export class CreateArtistUnavailablePeriodRequestDto extends ArtistUnavailablePeriodRangeDto {
  @ApiProperty({ minimum: 0 })
  confirmedAffectedAppointmentCount!: number;

  @ApiProperty({ maxLength: 500 })
  reason!: string;
}

export class CancelArtistUnavailablePeriodRequestDto {
  @ApiProperty({ minimum: 1 })
  expectedRowVersion!: number;

  @ApiPropertyOptional({ maxLength: 500 })
  reason?: string;
}

export class ArtistUnavailablePeriodPreviewDto {
  @ApiProperty({ minimum: 0 })
  affectedAppointmentCount!: number;

  @ApiProperty({ format: 'uuid' })
  artistId!: string;

  @ApiProperty({ maximum: 1440, minimum: 15, multipleOf: 15 })
  endMinute!: number;

  @ApiProperty({ format: 'uuid' })
  siteId!: string;

  @ApiProperty({ maximum: 1425, minimum: 0, multipleOf: 15 })
  startMinute!: number;

  @ApiProperty({ format: 'date' })
  unavailableDate!: string;
}

export class ArtistUnavailablePeriodSummaryDto extends ArtistUnavailablePeriodPreviewDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ maxLength: 500 })
  reason!: string;

  @ApiProperty({ minimum: 1 })
  rowVersion!: number;

  @ApiProperty({ enum: ['ACTIVE', 'CANCELLED'] })
  status!: string;
}
