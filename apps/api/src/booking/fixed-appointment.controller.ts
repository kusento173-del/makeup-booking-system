import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Ip,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiHeader,
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
  CancelFixedRequestDto,
  ChangeFixedRequestDto,
  CreateFixedRequestDto,
  FixedAvailabilityResultDto,
  FixedHostStateDto,
  FixedRulePageDto,
  ManagedHostPageDto,
  FixedRequestCreateResultDto,
  FixedRequestPageDto,
  FixedRequestReviewResultDto,
  FixedRequestWithdrawResultDto,
  ReviewFixedRequestDto,
  WithdrawFixedRequestDto,
} from './booking-openapi.dto';
import {
  parseCancelFixedRequest,
  parseChangeFixedRequest,
  parseCreateFixedRequest,
  parseFixedAvailabilityRequest,
  parseFixedHostStateRequest,
  parseFixedRuleList,
  parseManagedHostList,
  parseFixedRequestList,
  parseReviewFixedRequest,
  parseWithdrawFixedRequest,
} from './booking-request.parser';
import { FixedAvailabilityService } from './fixed-availability.service';
import type { FixedAvailabilityResult } from './fixed-availability.types';
import { FixedRequestQueryService } from './fixed-request-query.service';
import type { FixedRequestPage, FixedRulePage } from './fixed-request-query.types';
import { FixedRequestReviewService } from './fixed-request-review.service';
import { FixedRequestWithdrawService } from './fixed-request-withdraw.service';
import { FixedRequestService } from './fixed-request.service';
import type {
  FixedRequestCreateResult,
  FixedRequestReviewResult,
  FixedRequestWithdrawResult,
} from './fixed-request.types';
import { FixedStateService } from './fixed-state.service';
import type { FixedHostState } from './fixed-state.types';
import type { ManagedHostPage } from './fixed-state.types';

@ApiTags('固定化妆预约')
@ApiBearerAuth('access-token')
@ApiBadRequestResponse({ type: ApiErrorResponseDto })
@ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
@ApiForbiddenResponse({ type: ApiErrorResponseDto })
@UseGuards(AccessTokenGuard)
@Controller('fixed-appointments')
export class FixedAppointmentController {
  constructor(
    private readonly availability: FixedAvailabilityService,
    private readonly contexts: MasterDataCommandContextService,
    private readonly requestQueries: FixedRequestQueryService,
    private readonly requestReviews: FixedRequestReviewService,
    private readonly requests: FixedRequestService,
    private readonly states: FixedStateService,
    private readonly withdrawals: FixedRequestWithdrawService,
  ) {}

  @Get('availability')
  @ApiOperation({ summary: '查询固定预约可选时段与最早可持续开始日期' })
  @ApiQuery({ format: 'uuid', name: 'artistId', type: String })
  @ApiQuery({ format: 'uuid', name: 'currentRuleId', required: false, type: String })
  @ApiQuery({ enum: [15, 30, 45, 60], name: 'durationMinutes', type: Number })
  @ApiQuery({ format: 'uuid', name: 'hostId', type: String })
  @ApiQuery({ format: 'date', name: 'requestedStartDate', type: String })
  @ApiQuery({ description: '逗号分隔的 ISO 星期，例如 1,3,5', name: 'weekdays', type: String })
  @ApiOkResponse({ type: FixedAvailabilityResultDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  getAvailability(
    @Query() query: unknown,
    @CurrentAuth() authorization: AccessTokenClaims,
  ): Promise<FixedAvailabilityResult> {
    return this.availability.getAvailability(authorization, parseFixedAvailabilityRequest(query));
  }

  @Get('hosts/:hostId/state')
  @ApiOperation({ summary: '按当前角色范围查询主播的有效固定规则和待审申请' })
  @ApiOkResponse({ type: FixedHostStateDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  getHostState(
    @Param('hostId') hostId: string,
    @CurrentAuth() authorization: AccessTokenClaims,
  ): Promise<FixedHostState> {
    return this.states.get(authorization, parseFixedHostStateRequest(hostId));
  }

  @Get('managed-hosts')
  @ApiOperation({ summary: '按目标日期分页查询当前运营负责的主播及固定状态' })
  @ApiQuery({ format: 'date', name: 'asOf', type: String })
  @ApiQuery({ format: 'uuid', name: 'hostId', required: false, type: String })
  @ApiQuery({ minimum: 1, name: 'page', required: false, type: Number })
  @ApiQuery({ maximum: 100, minimum: 1, name: 'pageSize', required: false, type: Number })
  @ApiQuery({ maxLength: 64, name: 'search', required: false, type: String })
  @ApiOkResponse({ type: ManagedHostPageDto })
  listManagedHosts(
    @Query() query: unknown,
    @CurrentAuth() authorization: AccessTokenClaims,
  ): Promise<ManagedHostPage> {
    return this.states.listManagedHosts(authorization, parseManagedHostList(query));
  }

  @Get('rules')
  @ApiOperation({ summary: '查询客服或管理员权限范围内的固定主播名单' })
  @ApiQuery({ minimum: 1, name: 'page', required: false, type: Number })
  @ApiQuery({ maximum: 100, minimum: 1, name: 'pageSize', required: false, type: Number })
  @ApiQuery({ maxLength: 100, name: 'search', required: false, type: String })
  @ApiQuery({ format: 'uuid', name: 'siteId', required: false, type: String })
  @ApiQuery({ enum: ['ACTIVE', 'ENDED'], name: 'status', required: false })
  @ApiOkResponse({ type: FixedRulePageDto })
  listRules(
    @Query() query: unknown,
    @CurrentAuth() authorization: AccessTokenClaims,
  ): Promise<FixedRulePage> {
    return this.requestQueries.listRules(authorization, parseFixedRuleList(query));
  }

  @Get('requests')
  @ApiOperation({ summary: '按角色范围查询固定预约申请' })
  @ApiQuery({ minimum: 1, name: 'page', required: false, type: Number })
  @ApiQuery({ maximum: 100, minimum: 1, name: 'pageSize', required: false, type: Number })
  @ApiQuery({ enum: ['CANCEL', 'CHANGE', 'CREATE'], name: 'requestType', required: false })
  @ApiQuery({
    enum: ['APPROVED', 'PENDING', 'REJECTED', 'WITHDRAWN'],
    name: 'status',
    required: false,
  })
  @ApiOkResponse({ type: FixedRequestPageDto })
  listRequests(
    @Query() query: unknown,
    @CurrentAuth() authorization: AccessTokenClaims,
  ): Promise<FixedRequestPage> {
    return this.requestQueries.list(authorization, parseFixedRequestList(query));
  }

  @Post('requests/:requestId/review')
  @HttpCode(200)
  @ApiOperation({ summary: '本站客服或管理员审核固定预约申请' })
  @ApiOkResponse({ type: FixedRequestReviewResultDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  async reviewRequest(
    @Param('requestId') requestId: string,
    @Body() body: ReviewFixedRequestDto,
    @CurrentAuth() authorization: AccessTokenClaims,
    @Ip() ipAddress: string,
    @Headers('user-agent') userAgent?: string,
    @Headers('x-request-id') traceId?: string,
  ): Promise<FixedRequestReviewResult> {
    const command = parseReviewFixedRequest(requestId, body);
    const context = await this.contexts.resolve(authorization, {
      clientType: 'ADMIN_WEB',
      ipAddress,
      ...(traceId ? { requestId: traceId } : {}),
      ...(userAgent ? { userAgent } : {}),
    });
    return this.requestReviews.review(context, command);
  }

  @Post('requests')
  @ApiOperation({ summary: '运营提交固定化妆预约创建申请' })
  @ApiHeader({
    description: '同一用户内唯一，建议使用 UUID',
    name: 'Idempotency-Key',
    required: true,
  })
  @ApiCreatedResponse({ type: FixedRequestCreateResultDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  async createRequest(
    @Body() body: CreateFixedRequestDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentAuth() authorization: AccessTokenClaims,
    @Ip() ipAddress: string,
    @Headers('user-agent') userAgent?: string,
    @Headers('x-request-id') requestId?: string,
  ): Promise<FixedRequestCreateResult> {
    const command = parseCreateFixedRequest(body, idempotencyKey);
    const context = await this.contexts.resolve(authorization, {
      clientType: 'WECHAT_MINI_PROGRAM',
      ipAddress,
      ...(requestId ? { requestId } : {}),
      ...(userAgent ? { userAgent } : {}),
    });
    return this.requests.create(context, command);
  }

  @Post('requests/change')
  @ApiOperation({ summary: '运营提交固定预约星期、时间或时长变更申请' })
  @ApiHeader({ description: '同一用户内唯一，建议使用 UUID', name: 'Idempotency-Key' })
  @ApiCreatedResponse({ type: FixedRequestCreateResultDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  async changeRequest(
    @Body() body: ChangeFixedRequestDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentAuth() authorization: AccessTokenClaims,
    @Ip() ipAddress: string,
    @Headers('user-agent') userAgent?: string,
    @Headers('x-request-id') requestId?: string,
  ): Promise<FixedRequestCreateResult> {
    const command = parseChangeFixedRequest(body, idempotencyKey);
    const context = await this.contexts.resolve(authorization, {
      clientType: 'WECHAT_MINI_PROGRAM',
      ipAddress,
      ...(requestId ? { requestId } : {}),
      ...(userAgent ? { userAgent } : {}),
    });
    return this.requests.change(context, command);
  }

  @Post('requests/cancel')
  @ApiOperation({ summary: '运营提交取消固定预约申请' })
  @ApiHeader({ description: '同一用户内唯一，建议使用 UUID', name: 'Idempotency-Key' })
  @ApiCreatedResponse({ type: FixedRequestCreateResultDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  async cancelRequest(
    @Body() body: CancelFixedRequestDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentAuth() authorization: AccessTokenClaims,
    @Ip() ipAddress: string,
    @Headers('user-agent') userAgent?: string,
    @Headers('x-request-id') requestId?: string,
  ): Promise<FixedRequestCreateResult> {
    const command = parseCancelFixedRequest(body, idempotencyKey);
    const context = await this.contexts.resolve(authorization, {
      clientType: 'WECHAT_MINI_PROGRAM',
      ipAddress,
      ...(requestId ? { requestId } : {}),
      ...(userAgent ? { userAgent } : {}),
    });
    return this.requests.cancel(context, command);
  }

  @Post('requests/:requestId/withdraw')
  @HttpCode(200)
  @ApiOperation({ summary: '原提交运营在审核前撤回固定预约申请' })
  @ApiOkResponse({ type: FixedRequestWithdrawResultDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  async withdrawRequest(
    @Param('requestId') requestId: string,
    @Body() body: WithdrawFixedRequestDto,
    @CurrentAuth() authorization: AccessTokenClaims,
    @Ip() ipAddress: string,
    @Headers('user-agent') userAgent?: string,
    @Headers('x-request-id') traceId?: string,
  ): Promise<FixedRequestWithdrawResult> {
    const command = parseWithdrawFixedRequest(requestId, body);
    const context = await this.contexts.resolve(authorization, {
      clientType: 'WECHAT_MINI_PROGRAM',
      ipAddress,
      ...(traceId ? { requestId: traceId } : {}),
      ...(userAgent ? { userAgent } : {}),
    });
    return this.withdrawals.withdraw(context, command);
  }
}
