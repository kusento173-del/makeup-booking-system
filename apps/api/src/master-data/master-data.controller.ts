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
  ApiNotFoundResponse,
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
  DatedSiteFilteredMasterDataListQueryDto,
  EndOperatorAssignmentRequestDto,
  HostPageDto,
  HostOperatorRelationPageDto,
  MasterDataListQueryDto,
  OperatorPageDto,
  SiteSummaryDto,
  UpdateArtistRequestDto,
  UpdateHostRequestDto,
  UpdateOperatorRequestDto,
  UpdateSiteRequestDto,
} from './master-data-openapi.dto';
import { MasterDataQueryService } from './master-data-query.service';
import type {
  ArtistSummary,
  HostSummary,
  HostOperatorRelationSummary,
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
  parseEndOperatorAssignmentRequest,
  parseMasterDataListRequest,
  parseUpdateArtistRequest,
  parseUpdateHostRequest,
  parseUpdateOperatorRequest,
  parseUpdateSiteRequest,
} from './master-data-request.parser';
import { MasterDataUpdateService } from './master-data-update.service';

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
    private readonly updates: MasterDataUpdateService,
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

  @Patch('sites/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '修改或停用场地（仅管理员）' })
  @ApiBody({ type: UpdateSiteRequestDto })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  async updateSite(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentAuth() authorization: AccessTokenClaims,
    @Ip() ipAddress: string,
    @Headers('user-agent') userAgent?: string,
    @Headers('x-request-id') requestId?: string,
  ): Promise<void> {
    const context = await this.commandContext(authorization, ipAddress, userAgent, requestId);
    await this.updates.updateSite(context, parseUpdateSiteRequest(id, body));
  }

  @Patch('hosts/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '修改主播资料或预约资格' })
  @ApiBody({ type: UpdateHostRequestDto })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  async updateHost(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentAuth() authorization: AccessTokenClaims,
    @Ip() ipAddress: string,
    @Headers('user-agent') userAgent?: string,
    @Headers('x-request-id') requestId?: string,
  ): Promise<void> {
    const context = await this.commandContext(authorization, ipAddress, userAgent, requestId);
    await this.updates.updateHost(context, parseUpdateHostRequest(id, body));
  }

  @Patch('artists/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '修改或停用化妆师' })
  @ApiBody({ type: UpdateArtistRequestDto })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  async updateArtist(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentAuth() authorization: AccessTokenClaims,
    @Ip() ipAddress: string,
    @Headers('user-agent') userAgent?: string,
    @Headers('x-request-id') requestId?: string,
  ): Promise<void> {
    const context = await this.commandContext(authorization, ipAddress, userAgent, requestId);
    await this.updates.updateArtist(context, parseUpdateArtistRequest(id, body));
  }

  @Patch('operators/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '修改或停用运营' })
  @ApiBody({ type: UpdateOperatorRequestDto })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  async updateOperator(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentAuth() authorization: AccessTokenClaims,
    @Ip() ipAddress: string,
    @Headers('user-agent') userAgent?: string,
    @Headers('x-request-id') requestId?: string,
  ): Promise<void> {
    const context = await this.commandContext(authorization, ipAddress, userAgent, requestId);
    await this.updates.updateOperator(context, parseUpdateOperatorRequest(id, body));
  }

  @Patch('host-operator-relations/:id/end')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '结束主播—运营关系' })
  @ApiBody({ type: EndOperatorAssignmentRequestDto })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  async endOperatorAssignment(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentAuth() authorization: AccessTokenClaims,
    @Ip() ipAddress: string,
    @Headers('user-agent') userAgent?: string,
    @Headers('x-request-id') requestId?: string,
  ): Promise<void> {
    const context = await this.commandContext(authorization, ipAddress, userAgent, requestId);
    await this.updates.endOperatorAssignment(context, parseEndOperatorAssignmentRequest(id, body));
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
  @ApiQuery({ type: DatedSiteFilteredMasterDataListQueryDto })
  @ApiOkResponse({ type: HostPageDto })
  listHosts(
    @CurrentAuth() authorization: AccessTokenClaims,
    @Query() query: unknown,
  ): Promise<MasterDataPage<HostSummary>> {
    const request = parseMasterDataListRequest(query, {
      includeAsOf: true,
      includeSiteId: true,
    });
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

  @Get('host-operator-relations')
  @ApiOperation({ summary: '分页查询主播—运营关系（客服和管理员）' })
  @ApiQuery({ type: MasterDataListQueryDto })
  @ApiOkResponse({ type: HostOperatorRelationPageDto })
  listHostOperatorRelations(
    @CurrentAuth() authorization: AccessTokenClaims,
    @Query() query: unknown,
  ): Promise<MasterDataPage<HostOperatorRelationSummary>> {
    const request = parseMasterDataListRequest(query);
    return this.queries.listHostOperatorRelations(authorization, request.page);
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
