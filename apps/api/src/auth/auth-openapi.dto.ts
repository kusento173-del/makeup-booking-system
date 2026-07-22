import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { ROLE_CODES } from './authorization.types';

export class WechatLoginRequestDto {
  @ApiProperty({ description: 'wx.login 返回的一次性临时代码', maxLength: 256 })
  code!: string;
}

export class RefreshSessionRequestDto {
  @ApiProperty({ description: '上一次登录或刷新返回的刷新令牌', maxLength: 256 })
  refreshToken!: string;
}

export class SelectRoleRequestDto {
  @ApiProperty({ format: 'uuid' })
  roleAssignmentId!: string;

  @ApiProperty({ maxLength: 256 })
  roleSelectionChallenge!: string;
}

export class AccountBindingTargetDto {
  @ApiProperty({ enum: ['HOST', 'ARTIST', 'OPERATOR'] })
  roleCode!: string;

  @ApiPropertyOptional({ description: '主播角色必填' })
  hostCode?: string;

  @ApiPropertyOptional({ description: '化妆师角色必填' })
  nickname?: string;

  @ApiPropertyOptional({ description: '运营角色必填' })
  realName?: string;

  @ApiPropertyOptional({ description: '运营角色必填' })
  siteCode?: string;
}

export class BindWechatAccountRequestDto {
  @ApiProperty({ maxLength: 256 })
  bindingChallenge!: string;

  @ApiProperty({ example: 'ABCD-EFGH', maxLength: 32 })
  bindingCode!: string;

  @ApiProperty({ type: AccountBindingTargetDto })
  target!: AccountBindingTargetDto;
}

export class LoginRoleDto {
  @ApiProperty({ format: 'uuid' })
  roleAssignmentId!: string;

  @ApiProperty({ enum: ROLE_CODES })
  roleCode!: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  siteId!: string | null;
}

export class SessionTokenPairDto {
  @ApiProperty()
  accessToken!: string;

  @ApiProperty({ format: 'date-time' })
  accessTokenExpiresAt!: string;

  @ApiProperty()
  refreshToken!: string;

  @ApiProperty({ format: 'date-time' })
  refreshTokenExpiresAt!: string;

  @ApiProperty({ type: LoginRoleDto })
  role!: LoginRoleDto;

  @ApiProperty({ format: 'uuid' })
  sessionId!: string;

  @ApiProperty({ format: 'uuid' })
  userId!: string;
}

export class AuthFlowResponseDto {
  @ApiProperty({ enum: ['BINDING_REQUIRED', 'ROLE_SELECTION_REQUIRED', 'SESSION_CREATED'] })
  kind!: string;

  @ApiPropertyOptional()
  bindingChallenge?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  bindingChallengeExpiresAt?: string;

  @ApiPropertyOptional()
  roleSelectionChallenge?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  expiresAt?: string;

  @ApiPropertyOptional({ isArray: true, type: LoginRoleDto })
  roles?: LoginRoleDto[];

  @ApiPropertyOptional({ type: SessionTokenPairDto })
  session?: SessionTokenPairDto;
}

export class AccessTokenClaimsDto {
  @ApiProperty({ format: 'date-time' })
  expiresAt!: string;

  @ApiProperty({ format: 'uuid' })
  roleAssignmentId!: string;

  @ApiProperty({ enum: ROLE_CODES })
  roleCode!: string;

  @ApiProperty({ format: 'uuid' })
  sessionId!: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  siteId!: string | null;

  @ApiProperty({ format: 'uuid' })
  userId!: string;
}

export class ApiErrorBodyDto {
  @ApiProperty()
  code!: string;

  @ApiProperty()
  message!: string;
}

export class ApiErrorResponseDto {
  @ApiProperty({ type: ApiErrorBodyDto })
  error!: ApiErrorBodyDto;

  @ApiProperty()
  statusCode!: number;
}
