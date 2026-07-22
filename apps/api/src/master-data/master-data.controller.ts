import { Body, Controller, Get, Headers, Ip, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { ApiErrorResponseDto } from '../auth/auth-openapi.dto';
import { AccessTokenGuard } from '../auth/access-token.guard';
import type { AccessTokenClaims } from '../auth/auth-session.types';
import { CurrentAuth } from '../auth/current-auth.decorator';
import { MasterDataCommandContextService } from './master-data-command-context.service';
import type { MasterDataCommandContext } from './master-data-command.types';
import { MasterDataCreateService } from './master-data-create.service';
import {
  AssignOperatorRequestDto,
  ArtistPageDto,
  CreatedMasterDataDto,
  CreateArtistRequestDto,
  CreateHostRequestDto,
  CreateOperatorRequestDto,
  CreateSiteRequestDto,
  DatedMasterDataListQueryDto,
  HostPageDto,
  MasterDataListQueryDto,
  OperatorPageDto,
  SiteSummaryDto,
} from './master-data-openapi.dto';
import { MasterDataQueryService } from './master-data-query.service';
import type {
  ArtistSummary,
  HostSummary,
  MasterDataPage,
  OperatorSummary,
  SiteSummary,
} from './master-data-query.types';
import {
  assertNoMasterDataQuery,
  parseAssignOperatorRequest,
  parseCreateArtistRequest,
  parseCreateHostRequest,
  parseCreateOperatorRequest,
  parseCreateSiteRequest,
  parseMasterDataListRequest,
} from './master-data-request.parser';

@ApiTags('主数据')
@ApiBearerAuth('access-token')
@ApiBadRequestResponse({ type: ApiErrorResponseDto })
@ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
@ApiForbiddenResponse({ type: ApiErrorResponseDto })
@UseGuards(AccessTokenGuard)
@Controller('master-data')
export class MasterDataController {
  constructor(
    private readonly contexts: MasterDataCommandContextService,
    private readonly creates: MasterDataCreateService,
    private readonly queries: MasterDataQueryService,
  ) {}

  @Post('sites')
  @ApiOperation({ summary: '新增场地（仅管理员）' })
  @ApiBody({ type: CreateSiteRequestDto })
  @ApiCreatedResponse({ type: CreatedMasterDataDto })
  async createSite(
    @Body() body: unknown,
    @CurrentAuth() authorization: AccessTokenClaims,
    @Ip() ipAddress: string,
    @Headers('user-agent') userAgent?: string,
    @Headers('x-request-id') requestId?: string,
  ): Promise<{ readonly id: string }> {
    const context = await this.commandContext(authorization, ipAddress, userAgent, requestId);
    return { id: await this.creates.createSite(context, parseCreateSiteRequest(body)) };
  }

  @Post('hosts')
  @ApiOperation({ summary: '新增主播' })
  @ApiBody({ type: CreateHostRequestDto })
  @ApiCreatedResponse({ type: CreatedMasterDataDto })
  async createHost(
    @Body() body: unknown,
    @CurrentAuth() authorization: AccessTokenClaims,
    @Ip() ipAddress: string,
    @Headers('user-agent') userAgent?: string,
    @Headers('x-request-id') requestId?: string,
  ): Promise<{ readonly id: string }> {
    const context = await this.commandContext(authorization, ipAddress, userAgent, requestId);
    return { id: await this.creates.createHost(context, parseCreateHostRequest(body)) };
  }

  @Post('artists')
  @ApiOperation({ summary: '新增化妆师' })
  @ApiBody({ type: CreateArtistRequestDto })
  @ApiCreatedResponse({ type: CreatedMasterDataDto })
  async createArtist(
    @Body() body: unknown,
    @CurrentAuth() authorization: AccessTokenClaims,
    @Ip() ipAddress: string,
    @Headers('user-agent') userAgent?: string,
    @Headers('x-request-id') requestId?: string,
  ): Promise<{ readonly id: string }> {
    const context = await this.commandContext(authorization, ipAddress, userAgent, requestId);
    return { id: await this.creates.createArtist(context, parseCreateArtistRequest(body)) };
  }

  @Post('operators')
  @ApiOperation({ summary: '新增运营' })
  @ApiBody({ type: CreateOperatorRequestDto })
  @ApiCreatedResponse({ type: CreatedMasterDataDto })
  async createOperator(
    @Body() body: unknown,
    @CurrentAuth() authorization: AccessTokenClaims,
    @Ip() ipAddress: string,
    @Headers('user-agent') userAgent?: string,
    @Headers('x-request-id') requestId?: string,
  ): Promise<{ readonly id: string }> {
    const context = await this.commandContext(authorization, ipAddress, userAgent, requestId);
    return { id: await this.creates.createOperator(context, parseCreateOperatorRequest(body)) };
  }

  @Post('host-operator-relations')
  @ApiOperation({ summary: '建立主播—运营有效期关系' })
  @ApiBody({ type: AssignOperatorRequestDto })
  @ApiCreatedResponse({ type: CreatedMasterDataDto })
  async assignOperator(
    @Body() body: unknown,
    @CurrentAuth() authorization: AccessTokenClaims,
    @Ip() ipAddress: string,
    @Headers('user-agent') userAgent?: string,
    @Headers('x-request-id') requestId?: string,
  ): Promise<{ readonly id: string }> {
    const context = await this.commandContext(authorization, ipAddress, userAgent, requestId);
    return { id: await this.creates.assignOperator(context, parseAssignOperatorRequest(body)) };
  }

  @Get('sites')
  @ApiOperation({ summary: '查询当前角色可见场地' })
  @ApiOkResponse({ type: [SiteSummaryDto] })
  listSites(
    @CurrentAuth() authorization: AccessTokenClaims,
    @Query() query: unknown,
  ): Promise<SiteSummary[]> {
    assertNoMasterDataQuery(query);
    return this.queries.listSites(authorization);
  }

  @Get('hosts')
  @ApiOperation({ summary: '分页查询当前角色可见主播' })
  @ApiQuery({ type: DatedMasterDataListQueryDto })
  @ApiOkResponse({ type: HostPageDto })
  listHosts(
    @CurrentAuth() authorization: AccessTokenClaims,
    @Query() query: unknown,
  ): Promise<MasterDataPage<HostSummary>> {
    const request = parseMasterDataListRequest(query, { includeAsOf: true });
    return this.queries.listHosts(authorization, request.asOf, request.page);
  }

  @Get('artists')
  @ApiOperation({ summary: '分页查询当前角色可见化妆师' })
  @ApiQuery({ type: MasterDataListQueryDto })
  @ApiOkResponse({ type: ArtistPageDto })
  listArtists(
    @CurrentAuth() authorization: AccessTokenClaims,
    @Query() query: unknown,
  ): Promise<MasterDataPage<ArtistSummary>> {
    const request = parseMasterDataListRequest(query);
    return this.queries.listArtists(authorization, request.page);
  }

  @Get('operators')
  @ApiOperation({ summary: '分页查询当前角色可见运营' })
  @ApiQuery({ type: DatedMasterDataListQueryDto })
  @ApiOkResponse({ type: OperatorPageDto })
  listOperators(
    @CurrentAuth() authorization: AccessTokenClaims,
    @Query() query: unknown,
  ): Promise<MasterDataPage<OperatorSummary>> {
    const request = parseMasterDataListRequest(query, { includeAsOf: true });
    return this.queries.listOperators(authorization, request.asOf, request.page);
  }

  private commandContext(
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
