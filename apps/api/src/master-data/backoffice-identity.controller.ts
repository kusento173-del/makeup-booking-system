import { Body, Controller, Headers, Ip, Post, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { AccessTokenGuard } from '../auth/access-token.guard';
import { ApiErrorResponseDto } from '../auth/auth-openapi.dto';
import type { AccessTokenClaims } from '../auth/auth-session.types';
import { BindingCodeIssuerService } from '../auth/binding-code-issuer.service';
import { CurrentAuth } from '../auth/current-auth.decorator';
import {
  IssuedBindingCodeDto,
  IssueBindingCodeRequestDto,
} from './backoffice-identity-openapi.dto';
import { parseIssueBindingCodeRequest } from './backoffice-identity-request.parser';
import { MasterDataCommandContextService } from './master-data-command-context.service';

@ApiTags('后台身份管理')
@ApiBearerAuth('access-token')
@ApiBadRequestResponse({ type: ApiErrorResponseDto })
@ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
@ApiForbiddenResponse({ type: ApiErrorResponseDto })
@UseGuards(AccessTokenGuard)
@Controller('backoffice')
export class BackofficeIdentityController {
  constructor(
    private readonly contexts: MasterDataCommandContextService,
    private readonly bindingCodes: BindingCodeIssuerService,
  ) {}

  @Post('binding-codes')
  @ApiOperation({ summary: '为未绑定的主播、化妆师或运营签发一次性绑定码' })
  @ApiBody({ type: IssueBindingCodeRequestDto })
  @ApiCreatedResponse({ type: IssuedBindingCodeDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  async issueBindingCode(
    @Body() body: unknown,
    @CurrentAuth() authorization: AccessTokenClaims,
    @Ip() ipAddress: string,
    @Headers('user-agent') userAgent?: string,
    @Headers('x-request-id') requestId?: string,
  ): Promise<IssuedBindingCodeDto> {
    const context = await this.contexts.resolve(authorization, {
      clientType: 'ADMIN_WEB',
      ipAddress,
      ...(requestId ? { requestId } : {}),
      ...(userAgent ? { userAgent } : {}),
    });
    const issued = await this.bindingCodes.issue(context, parseIssueBindingCodeRequest(body));

    return { ...issued, expiresAt: issued.expiresAt.toISOString() };
  }
}
