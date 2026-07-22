import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import {
  EMPLOYMENT_STATUSES,
  HOST_QUALIFICATION_STATUSES,
  SITE_STATUSES,
} from './master-data.constants';

export class MasterDataListQueryDto {
  @ApiPropertyOptional({ minimum: 1, type: Number })
  page?: number;

  @ApiPropertyOptional({ default: 50, maximum: 100, minimum: 1, type: Number })
  pageSize?: number;

  @ApiPropertyOptional({ maxLength: 64 })
  search?: string;
}

export class DatedMasterDataListQueryDto extends MasterDataListQueryDto {
  @ApiPropertyOptional({ description: '关系有效性判定日期，默认上海时区当天', format: 'date' })
  asOf?: string;
}

export class SiteSummaryDto {
  @ApiProperty()
  code!: string;

  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: SITE_STATUSES })
  status!: string;

  @ApiProperty()
  timezone!: string;
}

export class HostSummaryDto {
  @ApiProperty()
  hostCode!: string;

  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiPropertyOptional({ nullable: true })
  nickname!: string | null;

  @ApiProperty({ enum: HOST_QUALIFICATION_STATUSES })
  qualificationStatus!: string;

  @ApiProperty()
  realName!: string;

  @ApiProperty({ format: 'uuid' })
  siteId!: string;
}

export class ArtistSummaryDto {
  @ApiProperty({ enum: EMPLOYMENT_STATUSES })
  employmentStatus!: string;

  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  initialShiftConfigured!: boolean;

  @ApiProperty()
  nickname!: string;

  @ApiProperty()
  realName!: string;

  @ApiProperty({ format: 'uuid' })
  siteId!: string;
}

export class OperatorSummaryDto {
  @ApiProperty({ enum: EMPLOYMENT_STATUSES })
  employmentStatus!: string;

  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  realName!: string;

  @ApiProperty({ format: 'uuid' })
  siteId!: string;
}

class PageMetadataDto {
  @ApiProperty({ minimum: 1 })
  page!: number;

  @ApiProperty({ maximum: 100, minimum: 1 })
  pageSize!: number;

  @ApiProperty({ minimum: 0 })
  total!: number;
}

export class HostPageDto extends PageMetadataDto {
  @ApiProperty({ type: [HostSummaryDto] })
  items!: HostSummaryDto[];
}

export class ArtistPageDto extends PageMetadataDto {
  @ApiProperty({ type: [ArtistSummaryDto] })
  items!: ArtistSummaryDto[];
}

export class OperatorPageDto extends PageMetadataDto {
  @ApiProperty({ type: [OperatorSummaryDto] })
  items!: OperatorSummaryDto[];
}
