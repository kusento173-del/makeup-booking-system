import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { ROLE_CODES } from './authorization.types';

export class BackofficeLoginRequestDto {
  @ApiProperty({ description: '网页账号登录名', maxLength: 64 })
  loginName!: string;

  @ApiProperty({ format: 'password', maxLength: 128 })
  password!: string;
}

export class BackofficePasswordChangeRequestDto {
  @ApiProperty({ maxLength: 128 })
  currentPassword!: string;

  @ApiProperty({ maxLength: 128, minLength: 12 })
  newPassword!: string;
}

export class InitialPasswordChangeRequestDto {
  @ApiProperty({ maxLength: 128, minLength: 12 })
  newPassword!: string;

  @ApiProperty({ maxLength: 256 })
  passwordChangeChallenge!: string;
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
  @ApiProperty({
    enum: ['PASSWORD_CHANGE_REQUIRED', 'ROLE_SELECTION_REQUIRED', 'SESSION_CREATED'],
  })
  kind!: string;

  @ApiPropertyOptional()
  passwordChangeChallenge?: string;

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
