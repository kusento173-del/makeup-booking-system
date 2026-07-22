import { ApiProperty } from '@nestjs/swagger';

import { BINDABLE_ROLE_CODES } from '../auth/binding-code.types';

export class IssueBindingCodeRequestDto {
  @ApiProperty({ format: 'uuid' })
  profileId!: string;

  @ApiProperty({ enum: BINDABLE_ROLE_CODES })
  roleCode!: string;
}

export class IssuedBindingCodeDto extends IssueBindingCodeRequestDto {
  @ApiProperty({ format: 'uuid' })
  bindingCodeId!: string;

  @ApiProperty({ description: '只在本次响应中返回，请立即安全交给本人' })
  code!: string;

  @ApiProperty({ format: 'date-time' })
  expiresAt!: string;

  @ApiProperty({ format: 'uuid' })
  siteId!: string;
}
