import { Body, Controller, Get, Headers, HttpCode, Ip, Post, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { AccessTokenGuard } from './access-token.guard';
import { AuthFlowService } from './auth-flow.service';
import type { AuthFlowResult } from './auth-flow.types';
import {
  AccessTokenClaimsDto,
  ApiErrorResponseDto,
  AuthFlowResponseDto,
  BackofficeLoginRequestDto,
  BackofficePasswordChangeRequestDto,
  InitialPasswordChangeRequestDto,
  RefreshSessionRequestDto,
  SelectRoleRequestDto,
  SessionTokenPairDto,
} from './auth-openapi.dto';
import { AuthRateLimitService } from './auth-rate-limit.service';
import {
  parseBackofficeLoginRequest,
  parseBackofficePasswordChangeRequest,
  parseInitialPasswordChangeRequest,
  parseRefreshRequest,
  parseRoleSelectionRequest,
} from './auth-request.parser';
import { AuthSessionService } from './auth-session.service';
import type { AccessTokenClaims, SessionTokenPair } from './auth-session.types';
import { BackofficeLoginService } from './backoffice-login.service';
import { BackofficePasswordService } from './backoffice-password.service';
import { CurrentAuth } from './current-auth.decorator';
import { CurrentProfileService } from './current-profile.service';
import type { CurrentProfile } from './current-profile.types';

@ApiTags('认证')
@ApiBadRequestResponse({ type: ApiErrorResponseDto })
@ApiTooManyRequestsResponse({ type: ApiErrorResponseDto })
@ApiServiceUnavailableResponse({ type: ApiErrorResponseDto })
@Controller('auth')
export class AuthController {
  constructor(
    private readonly backofficeLogin: BackofficeLoginService,
    private readonly backofficePasswords: BackofficePasswordService,
    private readonly flow: AuthFlowService,
    private readonly rateLimits: AuthRateLimitService,
    private readonly sessions: AuthSessionService,
    private readonly currentProfile: CurrentProfileService,
  ) {}

  @Post(['password', 'backoffice/password'])
  @HttpCode(204)
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: '修改当前网页账号密码' })
  @ApiBody({ type: BackofficePasswordChangeRequestDto })
  @ApiNoContentResponse({ description: '密码修改成功，当前账号全部会话已注销' })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  async changePassword(
    @Body() body: unknown,
    @CurrentAuth() authorization: AccessTokenClaims,
    @Ip() ipAddress: string,
    @Headers('user-agent') userAgent?: string,
    @Headers('x-request-id') requestId?: string,
  ): Promise<void> {
    const request = parseBackofficePasswordChangeRequest(body);
    await this.rateLimits.assertAllowed('password-change-user', authorization.userId, 5, 15 * 60);
    await this.backofficePasswords.change({
      authorization,
      clientType: 'WEB',
      currentPassword: request.currentPassword,
      ipAddress,
      newPassword: request.newPassword,
      ...(requestId ? { requestId } : {}),
      ...(userAgent ? { userAgent } : {}),
    });
  }

  @Post(['password/login', 'backoffice/login'])
  @HttpCode(200)
  @ApiOperation({ summary: '网页账号密码登录' })
  @ApiBody({ type: BackofficeLoginRequestDto })
  @ApiOkResponse({ type: AuthFlowResponseDto })
  async login(@Body() body: unknown, @Ip() ipAddress: string): Promise<AuthFlowResult> {
    await this.rateLimits.assertAllowed('password-login-ip', ipAddress, 120, 10 * 60);
    const request = parseBackofficeLoginRequest(body);
    return this.flow.completeVerifiedAccount(
      await this.backofficeLogin.verify(request.loginName, request.password),
    );
  }

  @Post('password/complete')
  @HttpCode(200)
  @ApiOperation({ summary: '使用一次性凭证完成首次密码修改' })
  @ApiBody({ type: InitialPasswordChangeRequestDto })
  @ApiOkResponse({ type: AuthFlowResponseDto })
  async completeInitialPasswordChange(
    @Body() body: unknown,
    @Ip() ipAddress: string,
    @Headers('user-agent') userAgent?: string,
    @Headers('x-request-id') requestId?: string,
  ): Promise<AuthFlowResult> {
    await this.rateLimits.assertAllowed('initial-password-ip', ipAddress, 30, 10 * 60);
    const request = parseInitialPasswordChangeRequest(body);
    return this.flow.completeVerifiedAccount(
      await this.backofficePasswords.completeInitial({
        clientType: 'WEB',
        ipAddress,
        newPassword: request.newPassword,
        passwordChangeChallenge: request.passwordChangeChallenge,
        ...(requestId ? { requestId } : {}),
        ...(userAgent ? { userAgent } : {}),
      }),
    );
  }

  @Post('role-selection')
  @HttpCode(200)
  @ApiOperation({ summary: '多角色账号选择本次登录角色' })
  @ApiBody({ type: SelectRoleRequestDto })
  @ApiOkResponse({ type: AuthFlowResponseDto })
  async selectRole(@Body() body: unknown, @Ip() ipAddress: string): Promise<AuthFlowResult> {
    await this.rateLimits.assertAllowed('role-selection-ip', ipAddress, 120, 5 * 60);
    const request = parseRoleSelectionRequest(body);
    return this.flow.selectRole(request.roleSelectionChallenge, request.roleAssignmentId);
  }

  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: '轮换刷新令牌并签发新访问令牌' })
  @ApiBody({ type: RefreshSessionRequestDto })
  @ApiOkResponse({ type: SessionTokenPairDto })
  async refresh(@Body() body: unknown, @Ip() ipAddress: string): Promise<SessionTokenPair> {
    const refreshToken = parseRefreshRequest(body);
    await Promise.all([
      this.rateLimits.assertAllowed('refresh-ip', ipAddress, 2_000, 5 * 60),
      this.rateLimits.assertAllowed('refresh-token', refreshToken, 5, 5 * 60),
    ]);
    return this.sessions.refresh(refreshToken);
  }

  @Get('me')
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: '读取当前已验证身份' })
  @ApiOkResponse({ type: AccessTokenClaimsDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  me(@CurrentAuth() authorization: AccessTokenClaims): AccessTokenClaims {
    return authorization;
  }

  @Get('profile')
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: '读取当前账号和人员资料' })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  profile(@CurrentAuth() authorization: AccessTokenClaims): Promise<CurrentProfile> {
    return this.currentProfile.get(authorization);
  }

  @Post('logout')
  @HttpCode(204)
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: '退出当前会话' })
  @ApiNoContentResponse()
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  async logout(@CurrentAuth() authorization: AccessTokenClaims): Promise<void> {
    await this.sessions.revoke(authorization.userId, authorization.sessionId);
  }

  @Post('logout-all')
  @HttpCode(204)
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: '退出当前账号全部会话' })
  @ApiNoContentResponse()
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  async logoutAll(@CurrentAuth() authorization: AccessTokenClaims): Promise<void> {
    await this.sessions.revokeAll(authorization.userId);
  }
}
