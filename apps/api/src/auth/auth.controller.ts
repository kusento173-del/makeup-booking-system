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
  BindWechatAccountRequestDto,
  RefreshSessionRequestDto,
  SelectRoleRequestDto,
  SessionTokenPairDto,
  WechatLoginRequestDto,
} from './auth-openapi.dto';
import { AuthRateLimitService } from './auth-rate-limit.service';
import {
  parseAccountBindingRequest,
  parseBackofficeLoginRequest,
  parseRefreshRequest,
  parseRoleSelectionRequest,
  parseWechatLoginRequest,
} from './auth-request.parser';
import { AuthSessionService } from './auth-session.service';
import type { AccessTokenClaims, SessionTokenPair } from './auth-session.types';
import { CurrentAuth } from './current-auth.decorator';
import { BackofficeLoginService } from './backoffice-login.service';

@ApiTags('认证')
@ApiBadRequestResponse({ type: ApiErrorResponseDto })
@ApiTooManyRequestsResponse({ type: ApiErrorResponseDto })
@ApiServiceUnavailableResponse({ type: ApiErrorResponseDto })
@Controller('auth')
export class AuthController {
  constructor(
    private readonly backofficeLogin: BackofficeLoginService,
    private readonly flow: AuthFlowService,
    private readonly rateLimits: AuthRateLimitService,
    private readonly sessions: AuthSessionService,
  ) {}

  @Post('backoffice/login')
  @HttpCode(200)
  @ApiOperation({ summary: '客服或管理员密码登录' })
  @ApiBody({ type: BackofficeLoginRequestDto })
  @ApiOkResponse({ type: AuthFlowResponseDto })
  async loginBackoffice(@Body() body: unknown, @Ip() ipAddress: string): Promise<AuthFlowResult> {
    await this.rateLimits.assertAllowed('backoffice-login-ip', ipAddress, 120, 10 * 60);
    const request = parseBackofficeLoginRequest(body);
    return this.flow.completeVerifiedAccount(
      await this.backofficeLogin.verify(request.loginName, request.password),
    );
  }

  @Post('wechat/login')
  @HttpCode(200)
  @ApiOperation({ summary: '微信小程序登录' })
  @ApiBody({ type: WechatLoginRequestDto })
  @ApiOkResponse({ type: AuthFlowResponseDto })
  async login(@Body() body: unknown, @Ip() ipAddress: string): Promise<AuthFlowResult> {
    await this.rateLimits.assertAllowed('wechat-login-ip', ipAddress, 600, 5 * 60);
    return this.flow.login(parseWechatLoginRequest(body));
  }

  @Post('wechat/bind')
  @HttpCode(200)
  @ApiOperation({ summary: '使用一次性绑定码绑定人员档案' })
  @ApiBody({ type: BindWechatAccountRequestDto })
  @ApiOkResponse({ type: AuthFlowResponseDto })
  async bind(
    @Body() body: unknown,
    @Ip() ipAddress: string,
    @Headers('user-agent') userAgent?: string,
    @Headers('x-request-id') requestId?: string,
  ): Promise<AuthFlowResult> {
    await this.rateLimits.assertAllowed('wechat-bind-ip', ipAddress, 120, 10 * 60);
    return this.flow.bind(
      parseAccountBindingRequest(body, {
        clientType: 'WECHAT_MINIPROGRAM',
        ipAddress,
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
