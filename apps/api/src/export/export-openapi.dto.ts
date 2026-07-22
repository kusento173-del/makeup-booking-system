import { ApiProperty } from '@nestjs/swagger';

export class CreateExportRequestDto {
  @ApiProperty({ format: 'date' })
  scheduleDate!: string;

  @ApiProperty({ enum: ['ALL_SITES', 'SINGLE_SITE'] })
  scope!: string;

  @ApiProperty({ format: 'uuid', required: false })
  siteId?: string;
}

export class ExportSummaryDto {
  @ApiProperty({ format: 'date-time', nullable: true })
  completedAt!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty()
  downloadable!: boolean;

  @ApiProperty({ format: 'date-time', nullable: true })
  expiresAt!: string | null;

  @ApiProperty({ nullable: true })
  failureReason!: string | null;

  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ nullable: true })
  outputFilename!: string | null;

  @ApiProperty({ minimum: 0, nullable: true })
  rowCount!: number | null;

  @ApiProperty({ minimum: 1 })
  rowVersion!: number;

  @ApiProperty({ format: 'date' })
  scheduleDate!: string;

  @ApiProperty({ enum: ['ALL_SITES', 'SINGLE_SITE'] })
  scope!: string;

  @ApiProperty({ format: 'uuid', nullable: true })
  siteId!: string | null;

  @ApiProperty({ nullable: true })
  siteName!: string | null;

  @ApiProperty({ enum: ['FAILED', 'PENDING', 'PROCESSING', 'SUCCEEDED'] })
  status!: string;
}

export class ExportPageDto {
  @ApiProperty({ isArray: true, type: ExportSummaryDto })
  items!: ExportSummaryDto[];

  @ApiProperty({ minimum: 1 })
  page!: number;

  @ApiProperty({ maximum: 100, minimum: 1 })
  pageSize!: number;

  @ApiProperty({ minimum: 0 })
  total!: number;
}
