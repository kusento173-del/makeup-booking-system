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

export class CreatedMasterDataDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;
}

export class CreateSiteRequestDto {
  @ApiProperty({ maxLength: 32 })
  code!: string;

  @ApiProperty({ maxLength: 64 })
  name!: string;

  @ApiPropertyOptional({ default: 0, type: Number })
  sortOrder?: number;

  @ApiPropertyOptional({ default: 'Asia/Shanghai', maxLength: 64 })
  timezone?: string;
}

export class CreateHostRequestDto {
  @ApiProperty({ maxLength: 32 })
  hostCode!: string;

  @ApiPropertyOptional({ maxLength: 64, nullable: true })
  nickname?: string | null;

  @ApiProperty({ maxLength: 64 })
  realName!: string;

  @ApiProperty({ format: 'uuid' })
  siteId!: string;
}

export class CreateArtistRequestDto {
  @ApiProperty({ maxLength: 64 })
  nickname!: string;

  @ApiProperty({ maxLength: 64 })
  realName!: string;

  @ApiProperty({ format: 'uuid' })
  siteId!: string;
}

export class CreateOperatorRequestDto {
  @ApiProperty({ maxLength: 64 })
  realName!: string;

  @ApiProperty({ format: 'uuid' })
  siteId!: string;
}

export class AssignOperatorRequestDto {
  @ApiPropertyOptional({ maxLength: 500 })
  changeReason?: string;

  @ApiProperty({ format: 'uuid' })
  hostId!: string;

  @ApiProperty({ format: 'uuid' })
  operatorId!: string;

  @ApiProperty({ format: 'date' })
  validFrom!: string;

  @ApiPropertyOptional({ format: 'date' })
  validUntil?: string;
}

class UpdateMasterDataRequestDto {
  @ApiProperty({ minimum: 1, type: Number })
  expectedRowVersion!: number;

  @ApiProperty({ maxLength: 500 })
  reason!: string;
}

export class UpdateSiteRequestDto extends UpdateMasterDataRequestDto {
  @ApiProperty({ maxLength: 64 })
  name!: string;

  @ApiProperty({ type: Number })
  sortOrder!: number;

  @ApiProperty({ enum: SITE_STATUSES })
  status!: string;

  @ApiProperty({ maxLength: 64 })
  timezone!: string;
}

export class UpdateHostRequestDto extends UpdateMasterDataRequestDto {
  @ApiPropertyOptional({ maxLength: 64, nullable: true })
  nickname?: string | null;

  @ApiProperty({ enum: HOST_QUALIFICATION_STATUSES })
  qualificationStatus!: string;

  @ApiProperty({ maxLength: 64 })
  realName!: string;

  @ApiProperty({ format: 'uuid' })
  siteId!: string;
}

export class UpdateArtistRequestDto extends UpdateMasterDataRequestDto {
  @ApiProperty({ enum: EMPLOYMENT_STATUSES })
  employmentStatus!: string;

  @ApiProperty({ maxLength: 64 })
  nickname!: string;

  @ApiProperty({ maxLength: 64 })
  realName!: string;

  @ApiProperty({ format: 'uuid' })
  siteId!: string;
}

export class UpdateOperatorRequestDto extends UpdateMasterDataRequestDto {
  @ApiProperty({ enum: EMPLOYMENT_STATUSES })
  employmentStatus!: string;

  @ApiProperty({ maxLength: 64 })
  realName!: string;

  @ApiProperty({ format: 'uuid' })
  siteId!: string;
}

export class EndOperatorAssignmentRequestDto extends UpdateMasterDataRequestDto {
  @ApiProperty({ format: 'date' })
  validUntil!: string;
}

export class SiteSummaryDto {
  @ApiProperty()
  code!: string;

  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ minimum: 1 })
  rowVersion!: number;

  @ApiProperty()
  sortOrder!: number;

  @ApiProperty({ enum: SITE_STATUSES })
  status!: string;

  @ApiProperty()
  timezone!: string;
}

export class HostSummaryDto {
  @ApiProperty()
  accountBound!: boolean;

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

  @ApiProperty({ minimum: 1 })
  rowVersion!: number;

  @ApiProperty({ format: 'uuid' })
  siteId!: string;
}

export class ArtistSummaryDto {
  @ApiProperty()
  accountBound!: boolean;

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

  @ApiProperty({ minimum: 1 })
  rowVersion!: number;

  @ApiProperty({ format: 'uuid' })
  siteId!: string;
}

export class OperatorSummaryDto {
  @ApiProperty()
  accountBound!: boolean;

  @ApiProperty({ enum: EMPLOYMENT_STATUSES })
  employmentStatus!: string;

  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  realName!: string;

  @ApiProperty({ minimum: 1 })
  rowVersion!: number;

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

export class HostOperatorRelationSummaryDto {
  @ApiPropertyOptional({ nullable: true })
  changeReason!: string | null;

  @ApiProperty()
  hostCode!: string;

  @ApiProperty({ format: 'uuid' })
  hostId!: string;

  @ApiProperty()
  hostName!: string;

  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  operatorId!: string;

  @ApiProperty()
  operatorName!: string;

  @ApiProperty({ minimum: 1 })
  rowVersion!: number;

  @ApiProperty({ format: 'uuid' })
  siteId!: string;

  @ApiProperty({ format: 'date' })
  validFrom!: string;

  @ApiPropertyOptional({ format: 'date', nullable: true })
  validUntil!: string | null;
}

export class HostOperatorRelationPageDto extends PageMetadataDto {
  @ApiProperty({ type: [HostOperatorRelationSummaryDto] })
  items!: HostOperatorRelationSummaryDto[];
}
