import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
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
import {
  ArtistPageDto,
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
import { assertNoMasterDataQuery, parseMasterDataListRequest } from './master-data-request.parser';

@ApiTags('主数据')
@ApiBearerAuth('access-token')
@ApiBadRequestResponse({ type: ApiErrorResponseDto })
@ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
@ApiForbiddenResponse({ type: ApiErrorResponseDto })
@UseGuards(AccessTokenGuard)
@Controller('master-data')
export class MasterDataController {
  constructor(private readonly queries: MasterDataQueryService) {}

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
}
