import { ApiProperty } from '@nestjs/swagger';

export class AuditLogItemDto {
  @ApiProperty()
  action!: string;
  @ApiProperty()
  actorName!: string;
  @ApiProperty()
  actorRole!: string;
  @ApiProperty({ nullable: true, type: Object })
  afterData!: object | null;
  @ApiProperty({ nullable: true, type: Object })
  beforeData!: object | null;
  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
  @ApiProperty({ format: 'uuid' })
  id!: string;
  @ApiProperty({ format: 'uuid' })
  objectId!: string;
  @ApiProperty()
  objectType!: string;
  @ApiProperty({ nullable: true })
  reason!: string | null;
  @ApiProperty({ format: 'uuid', nullable: true })
  siteId!: string | null;
  @ApiProperty({ nullable: true })
  siteName!: string | null;
}

export class AuditLogPageDto {
  @ApiProperty({ isArray: true, type: AuditLogItemDto })
  items!: AuditLogItemDto[];
  @ApiProperty({ minimum: 1 })
  page!: number;
  @ApiProperty({ maximum: 100, minimum: 1 })
  pageSize!: number;
  @ApiProperty({ minimum: 0 })
  total!: number;
}
