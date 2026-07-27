import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ProvisionProfileAccountRequestDto {
  @ApiPropertyOptional({
    description: '主播不填时自动使用主播编号',
    maxLength: 64,
    minLength: 3,
  })
  loginName?: string;

  @ApiProperty({ format: 'uuid' })
  profileId!: string;

  @ApiProperty({ enum: ['HOST', 'OPERATOR', 'ARTIST'] })
  roleCode!: string;

  @ApiProperty({ maxLength: 128, minLength: 12, writeOnly: true })
  temporaryPassword!: string;
}

export class ProvisionedProfileAccountDto {
  @ApiProperty()
  loginName!: string;

  @ApiProperty({ format: 'uuid' })
  userId!: string;
}

export class ResetWebAccountPasswordRequestDto {
  @ApiProperty({ format: 'uuid' })
  profileId!: string;

  @ApiProperty({ maxLength: 500 })
  reason!: string;

  @ApiProperty({ enum: ['HOST', 'OPERATOR', 'ARTIST'] })
  roleCode!: string;

  @ApiProperty({ maxLength: 128, minLength: 12, writeOnly: true })
  temporaryPassword!: string;
}
