import { Body, Controller, Get, Headers, Ip, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiHeader,
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
import { MasterDataCommandContextService } from '../master-data/master-data-command-context.service';
import { CreateExportRequestDto, ExportPageDto, ExportSummaryDto } from './export-openapi.dto';
import { parseCreateExportRequest, parseExportListRequest } from './export-request.parser';
import { ExportService } from './export.service';
import type { ExportCommandContext, ExportPage, ExportSummary } from './export.types';

@ApiTags('排班导出')
@ApiBearerAuth('access-token')
@ApiBadRequestResponse({ type: ApiErrorResponseDto })
@ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
@ApiForbiddenResponse({ type: ApiErrorResponseDto })
@UseGuards(AccessTokenGuard)
@Controller('export-jobs')
export class ExportController {
  constructor(
    private readonly contexts: MasterDataCommandContextService,
    private readonly exports: ExportService,
  ) {}

  @Get()
  @ApiOperation({ summary: '按后台角色数据范围查询排班导出任务' })
  @ApiQuery({ minimum: 1, name: 'page', required: false, type: Number })
  @ApiQuery({ maximum: 100, minimum: 1, name: 'pageSize', required: false, type: Number })
  @ApiQuery({
    enum: ['FAILED', 'PENDING', 'PROCESSING', 'SUCCEEDED'],
    name: 'status',
    required: false,
  })
  @ApiOkResponse({ type: ExportPageDto })
  list(
    @Query() query: unknown,
    @CurrentAuth() authorization: AccessTokenClaims,
  ): Promise<ExportPage> {
    return this.exports.list(authorization, parseExportListRequest(query));
  }

  @Post()
  @ApiOperation({ summary: '创建异步排班 Excel 导出任务' })
  @ApiHeader({ description: '同一用户内唯一，建议使用 UUID', name: 'Idempotency-Key' })
  @ApiBody({ type: CreateExportRequestDto })
  @ApiCreatedResponse({ type: ExportSummaryDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  async create(
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyKey: unknown,
    @CurrentAuth() authorization: AccessTokenClaims,
    @Ip() ipAddress: string,
    @Headers('user-agent') userAgent?: string,
    @Headers('x-request-id') requestId?: string,
  ): Promise<ExportSummary> {
    const command = parseCreateExportRequest(body, idempotencyKey);
    const context = await this.context(authorization, ipAddress, userAgent, requestId);
    return this.exports.create(context, command);
  }

  private context(
    authorization: AccessTokenClaims,
    ipAddress: string,
    userAgent?: string,
    requestId?: string,
  ): Promise<ExportCommandContext> {
    return this.contexts.resolve(authorization, {
      clientType: 'ADMIN_WEB',
      ipAddress,
      ...(requestId ? { requestId } : {}),
      ...(userAgent ? { userAgent } : {}),
    });
  }
}
