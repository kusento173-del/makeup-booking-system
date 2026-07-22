import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Ip,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { AccessTokenGuard } from '../auth/access-token.guard';
import { ApiErrorResponseDto } from '../auth/auth-openapi.dto';
import type { AccessTokenClaims } from '../auth/auth-session.types';
import { BindingCodeIssuerService } from '../auth/binding-code-issuer.service';
import { CurrentAuth } from '../auth/current-auth.decorator';
import {
  AssignBackofficeRoleRequestDto,
  BackofficeAccountPageDto,
  CreateBackofficeAccountRequestDto,
  RevokeBackofficeRoleRequestDto,
  UpdateBackofficeAccountRequestDto,
} from './backoffice-account-openapi.dto';
import {
  parseAssignBackofficeRoleRequest,
  parseCreateBackofficeAccountRequest,
  parseRevokeBackofficeRoleRequest,
  parseUpdateBackofficeAccountRequest,
} from './backoffice-account-request.parser';
import { BackofficeAccountService } from './backoffice-account.service';
import type { BackofficeAccountPage } from './backoffice-account.types';
import {
  IssuedBindingCodeDto,
  IssueBindingCodeRequestDto,
} from './backoffice-identity-openapi.dto';
import { parseIssueBindingCodeRequest } from './backoffice-identity-request.parser';
import { MasterDataCommandContextService } from './master-data-command-context.service';
import type { MasterDataCommandContext } from './master-data-command.types';
import { CreatedMasterDataDto, MasterDataListQueryDto } from './master-data-openapi.dto';
import { parseMasterDataListRequest } from './master-data-request.parser';

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
    private readonly accounts: BackofficeAccountService,
  ) {}

  @Get('accounts')
  @ApiOperation({ summary: '分页查询账号及有效后台角色（仅管理员）' })
  @ApiQuery({ type: MasterDataListQueryDto })
  @ApiOkResponse({ type: BackofficeAccountPageDto })
  async listAccounts(
    @CurrentAuth() authorization: AccessTokenClaims,
    @Query() query: unknown,
  ): Promise<BackofficeAccountPage> {
    const request = parseMasterDataListRequest(query);
    const context = await this.contexts.resolve(authorization, { clientType: 'ADMIN_WEB' });
    return this.accounts.list(context, request.page);
  }

  @Post('accounts')
  @ApiOperation({ summary: '创建客服或管理员密码账号（仅管理员）' })
  @ApiBody({ type: CreateBackofficeAccountRequestDto })
  @ApiCreatedResponse({ type: CreatedMasterDataDto })
  async createAccount(
    @Body() body: unknown,
    @CurrentAuth() authorization: AccessTokenClaims,
    @Ip() ipAddress: string,
    @Headers('user-agent') userAgent?: string,
    @Headers('x-request-id') requestId?: string,
  ): Promise<{ readonly id: string }> {
    const context = await this.context(authorization, ipAddress, userAgent, requestId);
    return { id: await this.accounts.create(context, parseCreateBackofficeAccountRequest(body)) };
  }

  @Patch('accounts/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '修改或停用账号（仅管理员）' })
  @ApiBody({ type: UpdateBackofficeAccountRequestDto })
  @ApiNoContentResponse()
  async updateAccount(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentAuth() authorization: AccessTokenClaims,
    @Ip() ipAddress: string,
    @Headers('user-agent') userAgent?: string,
    @Headers('x-request-id') requestId?: string,
  ): Promise<void> {
    const context = await this.context(authorization, ipAddress, userAgent, requestId);
    await this.accounts.update(context, parseUpdateBackofficeAccountRequest(id, body));
  }

  @Post('accounts/:id/roles')
  @ApiOperation({ summary: '分配客服或管理员角色（仅管理员）' })
  @ApiBody({ type: AssignBackofficeRoleRequestDto })
  @ApiCreatedResponse({ type: CreatedMasterDataDto })
  async assignRole(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentAuth() authorization: AccessTokenClaims,
    @Ip() ipAddress: string,
    @Headers('user-agent') userAgent?: string,
    @Headers('x-request-id') requestId?: string,
  ): Promise<{ readonly id: string }> {
    const context = await this.context(authorization, ipAddress, userAgent, requestId);
    return {
      id: await this.accounts.assignRole(context, parseAssignBackofficeRoleRequest(id, body)),
    };
  }

  @Patch('roles/:id/revoke')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '撤销客服或管理员角色（仅管理员）' })
  @ApiBody({ type: RevokeBackofficeRoleRequestDto })
  @ApiNoContentResponse()
  async revokeRole(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentAuth() authorization: AccessTokenClaims,
    @Ip() ipAddress: string,
    @Headers('user-agent') userAgent?: string,
    @Headers('x-request-id') requestId?: string,
  ): Promise<void> {
    const context = await this.context(authorization, ipAddress, userAgent, requestId);
    await this.accounts.revokeRole(context, parseRevokeBackofficeRoleRequest(id, body));
  }

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
    const context = await this.context(authorization, ipAddress, userAgent, requestId);
    const issued = await this.bindingCodes.issue(context, parseIssueBindingCodeRequest(body));

    return { ...issued, expiresAt: issued.expiresAt.toISOString() };
  }

  private context(
    authorization: AccessTokenClaims,
    ipAddress: string,
    userAgent?: string,
    requestId?: string,
  ): Promise<MasterDataCommandContext> {
    return this.contexts.resolve(authorization, {
      clientType: 'ADMIN_WEB',
      ipAddress,
      ...(requestId ? { requestId } : {}),
      ...(userAgent ? { userAgent } : {}),
    });
  }
}
