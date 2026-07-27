import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Ip,
  Param,
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
import { CurrentAuth } from '../auth/current-auth.decorator';
import { MasterDataCommandContextService } from '../master-data/master-data-command-context.service';
import {
  OvertimePageDto,
  OvertimeRequestDto,
  OvertimeSummaryDto,
  ReviewOvertimeRequestDto,
  WithdrawOvertimeRequestDto,
} from './overtime-openapi.dto';
import {
  parseDirectApproveOvertimeRequest,
  parseOvertimeListRequest,
  parseReviewOvertimeRequest,
  parseSubmitOvertimeRequest,
  parseWithdrawOvertimeRequest,
} from './overtime-request.parser';
import { OvertimeService } from './overtime.service';
import type { OvertimeCommandContext, OvertimePage, OvertimeSummary } from './overtime.types';

@ApiTags('化妆师加班')
@ApiBearerAuth('access-token')
@ApiBadRequestResponse({ type: ApiErrorResponseDto })
@ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
@ApiForbiddenResponse({ type: ApiErrorResponseDto })
@UseGuards(AccessTokenGuard)
@Controller()
export class OvertimeController {
  constructor(
    private readonly contexts: MasterDataCommandContextService,
    private readonly overtimes: OvertimeService,
  ) {}

  @Get('overtimes')
  @ApiOperation({ summary: '按本人或后台场地范围查询加班申请' })
  @ApiQuery({ minimum: 1, name: 'page', required: false, type: Number })
  @ApiQuery({ maximum: 100, minimum: 1, name: 'pageSize', required: false, type: Number })
  @ApiQuery({
    enum: ['APPROVED', 'PENDING', 'REJECTED', 'WITHDRAWN'],
    name: 'status',
    required: false,
  })
  @ApiOkResponse({ type: OvertimePageDto })
  list(
    @Query() query: unknown,
    @CurrentAuth() authorization: AccessTokenClaims,
  ): Promise<OvertimePage> {
    return this.overtimes.list(authorization, parseOvertimeListRequest(query));
  }

  @Post('artists/:artistId/overtimes')
  @ApiOperation({ summary: '化妆师本人提交非工作日加班申请' })
  @ApiBody({ type: OvertimeRequestDto })
  @ApiCreatedResponse({ type: OvertimeSummaryDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  async submit(
    @Param('artistId') artistId: string,
    @Body() body: unknown,
    @CurrentAuth() authorization: AccessTokenClaims,
    @Ip() ipAddress: string,
    @Headers('user-agent') userAgent?: string,
    @Headers('x-request-id') requestId?: string,
  ): Promise<OvertimeSummary> {
    const command = parseSubmitOvertimeRequest(artistId, body);
    const context = await this.context(authorization, ipAddress, userAgent, requestId);
    return this.overtimes.submit(context, command);
  }

  @Post('artists/:artistId/overtimes/direct-approve')
  @ApiOperation({ summary: '客服或管理员直接添加已批准加班' })
  @ApiBody({ type: OvertimeRequestDto })
  @ApiCreatedResponse({ type: OvertimeSummaryDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  async directApprove(
    @Param('artistId') artistId: string,
    @Body() body: unknown,
    @CurrentAuth() authorization: AccessTokenClaims,
    @Ip() ipAddress: string,
    @Headers('user-agent') userAgent?: string,
    @Headers('x-request-id') requestId?: string,
  ): Promise<OvertimeSummary> {
    const command = parseDirectApproveOvertimeRequest(artistId, body);
    const context = await this.context(authorization, ipAddress, userAgent, requestId);
    return this.overtimes.directApprove(context, command);
  }

  @Post('overtimes/:overtimeId/withdraw')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '化妆师撤回本人待审核加班' })
  @ApiBody({ type: WithdrawOvertimeRequestDto })
  @ApiNoContentResponse()
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  async withdraw(
    @Param('overtimeId') overtimeId: string,
    @Body() body: unknown,
    @CurrentAuth() authorization: AccessTokenClaims,
    @Ip() ipAddress: string,
    @Headers('user-agent') userAgent?: string,
    @Headers('x-request-id') requestId?: string,
  ): Promise<void> {
    const command = parseWithdrawOvertimeRequest(overtimeId, body);
    const context = await this.context(authorization, ipAddress, userAgent, requestId);
    return this.overtimes.withdraw(context, command);
  }

  @Post('overtimes/:overtimeId/review')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '客服或管理员审核加班申请' })
  @ApiBody({ type: ReviewOvertimeRequestDto })
  @ApiOkResponse({ type: OvertimeSummaryDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  async review(
    @Param('overtimeId') overtimeId: string,
    @Body() body: unknown,
    @CurrentAuth() authorization: AccessTokenClaims,
    @Ip() ipAddress: string,
    @Headers('user-agent') userAgent?: string,
    @Headers('x-request-id') requestId?: string,
  ): Promise<OvertimeSummary> {
    const command = parseReviewOvertimeRequest(overtimeId, body);
    const context = await this.context(authorization, ipAddress, userAgent, requestId);
    return this.overtimes.review(context, command);
  }

  private context(
    authorization: AccessTokenClaims,
    ipAddress: string,
    userAgent?: string,
    requestId?: string,
  ): Promise<OvertimeCommandContext> {
    return this.contexts.resolve(authorization, {
      clientType: authorization.roleCode === 'ARTIST' ? 'MOBILE_WEB' : 'ADMIN_WEB',
      ipAddress,
      ...(requestId ? { requestId } : {}),
      ...(userAgent ? { userAgent } : {}),
    });
  }
}
