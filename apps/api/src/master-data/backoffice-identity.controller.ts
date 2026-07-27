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
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { AccessTokenGuard } from '../auth/access-token.guard';
import { ApiErrorResponseDto } from '../auth/auth-openapi.dto';
import type { AccessTokenClaims } from '../auth/auth-session.types';
import { CurrentAuth } from '../auth/current-auth.decorator';
import {
  AssignBackofficeRoleRequestDto,
  BackofficeAccountListQueryDto,
  BackofficeAccountPageDto,
  CreateBackofficeAccountRequestDto,
  DeleteBackofficeAccountRequestDto,
  RevokeBackofficeRoleRequestDto,
  UpdateBackofficeAccountRequestDto,
} from './backoffice-account-openapi.dto';
import {
  parseAssignBackofficeRoleRequest,
  parseBackofficeAccountListRequest,
  parseCreateBackofficeAccountRequest,
  parseDeleteBackofficeAccountRequest,
  parseRevokeBackofficeRoleRequest,
  parseUpdateBackofficeAccountRequest,
} from './backoffice-account-request.parser';
import { BackofficeAccountService } from './backoffice-account.service';
import type { BackofficeAccountPage } from './backoffice-account.types';
import { MasterDataCommandContextService } from './master-data-command-context.service';
import type { MasterDataCommandContext } from './master-data-command.types';
import { CreatedMasterDataDto } from './master-data-openapi.dto';
import {
  ProvisionedProfileAccountDto,
  ProvisionProfileAccountRequestDto,
  ResetWebAccountPasswordRequestDto,
} from './web-account-openapi.dto';
import {
  parseProvisionProfileAccountRequest,
  parseResetWebAccountPasswordRequest,
} from './web-account-request.parser';
import { WebAccountService } from './web-account.service';

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
    private readonly accounts: BackofficeAccountService,
    private readonly webAccounts: WebAccountService,
  ) {}

  @Get('accounts')
  @ApiOperation({ summary: '分页查询账号及全部有效角色（仅管理员）' })
  @ApiQuery({ type: BackofficeAccountListQueryDto })
  @ApiOkResponse({ type: BackofficeAccountPageDto })
  async listAccounts(
    @CurrentAuth() authorization: AccessTokenClaims,
    @Query() query: unknown,
  ): Promise<BackofficeAccountPage> {
    const request = parseBackofficeAccountListRequest(query);
    const context = await this.contexts.resolve(authorization, { clientType: 'ADMIN_WEB' });
    return this.accounts.list(context, request);
  }

  @Post('profile-accounts')
  @ApiOperation({ summary: '为主播、运营或化妆师档案开通网页账号' })
  @ApiBody({ type: ProvisionProfileAccountRequestDto })
  @ApiCreatedResponse({ type: ProvisionedProfileAccountDto })
  async provisionProfileAccount(
    @Body() body: unknown,
    @CurrentAuth() authorization: AccessTokenClaims,
    @Ip() ipAddress: string,
    @Headers('user-agent') userAgent?: string,
    @Headers('x-request-id') requestId?: string,
  ): Promise<ProvisionedProfileAccountDto> {
    const context = await this.context(authorization, ipAddress, userAgent, requestId);
    return this.webAccounts.provisionProfile(context, parseProvisionProfileAccountRequest(body));
  }

  @Post('profile-accounts/password-reset')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '重置网页账号临时密码并注销全部会话' })
  @ApiBody({ type: ResetWebAccountPasswordRequestDto })
  @ApiNoContentResponse()
  async resetAccountPassword(
    @Body() body: unknown,
    @CurrentAuth() authorization: AccessTokenClaims,
    @Ip() ipAddress: string,
    @Headers('user-agent') userAgent?: string,
    @Headers('x-request-id') requestId?: string,
  ): Promise<void> {
    const context = await this.context(authorization, ipAddress, userAgent, requestId);
    await this.webAccounts.resetPassword(context, parseResetWebAccountPasswordRequest(body));
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
  @ApiOperation({ summary: '修改账号显示名称（仅管理员）' })
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

  @Post('accounts/:id/delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '删除客服账号（仅管理员）' })
  @ApiBody({ type: DeleteBackofficeAccountRequestDto })
  @ApiNoContentResponse()
  async deleteAccount(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentAuth() authorization: AccessTokenClaims,
    @Ip() ipAddress: string,
    @Headers('user-agent') userAgent?: string,
    @Headers('x-request-id') requestId?: string,
  ): Promise<void> {
    const context = await this.context(authorization, ipAddress, userAgent, requestId);
    await this.accounts.delete(context, parseDeleteBackofficeAccountRequest(id, body));
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
