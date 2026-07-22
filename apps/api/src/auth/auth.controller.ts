import { Body, Controller, Get, Headers, HttpCode, Ip, Post, UseGuards } from '@nestjs/common';

import { AccessTokenGuard } from './access-token.guard';
import { AuthFlowService } from './auth-flow.service';
import type { AuthFlowResult } from './auth-flow.types';
import {
  parseAccountBindingRequest,
  parseRefreshRequest,
  parseRoleSelectionRequest,
  parseWechatLoginRequest,
} from './auth-request.parser';
import { AuthSessionService } from './auth-session.service';
import type { AccessTokenClaims, SessionTokenPair } from './auth-session.types';
import { CurrentAuth } from './current-auth.decorator';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly flow: AuthFlowService,
    private readonly sessions: AuthSessionService,
  ) {}

  @Post('wechat/login')
  @HttpCode(200)
  login(@Body() body: unknown): Promise<AuthFlowResult> {
    return this.flow.login(parseWechatLoginRequest(body));
  }

  @Post('wechat/bind')
  @HttpCode(200)
  bind(
    @Body() body: unknown,
    @Ip() ipAddress: string,
    @Headers('user-agent') userAgent?: string,
    @Headers('x-request-id') requestId?: string,
  ): Promise<AuthFlowResult> {
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
  selectRole(@Body() body: unknown): Promise<AuthFlowResult> {
    const request = parseRoleSelectionRequest(body);
    return this.flow.selectRole(request.roleSelectionChallenge, request.roleAssignmentId);
  }

  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() body: unknown): Promise<SessionTokenPair> {
    return this.sessions.refresh(parseRefreshRequest(body));
  }

  @Get('me')
  @UseGuards(AccessTokenGuard)
  me(@CurrentAuth() authorization: AccessTokenClaims): AccessTokenClaims {
    return authorization;
  }

  @Post('logout')
  @HttpCode(204)
  @UseGuards(AccessTokenGuard)
  async logout(@CurrentAuth() authorization: AccessTokenClaims): Promise<void> {
    await this.sessions.revoke(authorization.userId, authorization.sessionId);
  }

  @Post('logout-all')
  @HttpCode(204)
  @UseGuards(AccessTokenGuard)
  async logoutAll(@CurrentAuth() authorization: AccessTokenClaims): Promise<void> {
    await this.sessions.revokeAll(authorization.userId);
  }
}
