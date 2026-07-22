import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateBackofficeAccountRequestDto {
  @ApiProperty({ maxLength: 64 })
  displayName!: string;
  @ApiProperty({ maxLength: 64, minLength: 3 })
  loginName!: string;
  @ApiProperty({ maxLength: 128, minLength: 12, writeOnly: true })
  password!: string;
  @ApiProperty({ enum: ['ADMIN', 'CUSTOMER_SERVICE'] })
  roleCode!: string;
  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  siteId?: string | null;
}

export class UpdateBackofficeAccountRequestDto {
  @ApiProperty({ maxLength: 64 })
  displayName!: string;
  @ApiProperty({ minimum: 1 })
  expectedRowVersion!: number;
  @ApiProperty({ maxLength: 500 })
  reason!: string;
  @ApiProperty({ enum: ['ACTIVE', 'DISABLED'] })
  status!: string;
}

export class AssignBackofficeRoleRequestDto {
  @ApiProperty({ enum: ['ADMIN', 'CUSTOMER_SERVICE'] })
  roleCode!: string;
  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  siteId?: string | null;
}

export class RevokeBackofficeRoleRequestDto {
  @ApiProperty({ minimum: 1 })
  expectedRowVersion!: number;
  @ApiProperty({ maxLength: 500 })
  reason!: string;
}

export class BackofficeRoleSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;
  @ApiProperty({ enum: ['ADMIN', 'CUSTOMER_SERVICE'] })
  roleCode!: string;
  @ApiProperty({ minimum: 1 })
  rowVersion!: number;
  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  siteId!: string | null;
}

export class BackofficeAccountSummaryDto {
  @ApiProperty()
  displayName!: string;
  @ApiProperty({ format: 'uuid' })
  id!: string;
  @ApiPropertyOptional({ nullable: true })
  loginName!: string | null;
  @ApiProperty({ type: [BackofficeRoleSummaryDto] })
  roles!: BackofficeRoleSummaryDto[];
  @ApiProperty({ minimum: 1 })
  rowVersion!: number;
  @ApiProperty({ enum: ['ACTIVE', 'DISABLED'] })
  status!: string;
}

export class BackofficeAccountPageDto {
  @ApiProperty({ type: [BackofficeAccountSummaryDto] })
  items!: BackofficeAccountSummaryDto[];
  @ApiProperty({ minimum: 1 })
  page!: number;
  @ApiProperty({ maximum: 100, minimum: 1 })
  pageSize!: number;
  @ApiProperty({ minimum: 0 })
  total!: number;
}
