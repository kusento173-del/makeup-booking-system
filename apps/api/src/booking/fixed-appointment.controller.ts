import { Body, Controller, Get, Headers, Ip, Post, Query, UseGuards } from '@nestjs/common';
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
  FixedAvailabilityResultDto,
  FixedRequestCreateResultDto,
  CreateFixedRequestDto,
} from './booking-openapi.dto';
import { parseCreateFixedRequest, parseFixedAvailabilityRequest } from './booking-request.parser';
import { FixedAvailabilityService } from './fixed-availability.service';
import type { FixedAvailabilityResult } from './fixed-availability.types';
import { FixedRequestService } from './fixed-request.service';
import type { FixedRequestCreateResult } from './fixed-request.types';

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
    private readonly requests: FixedRequestService,
  ) {}

  @Get('availability')
  @ApiOperation({ summary: '查询固定预约可选时段与最早可持续开始日期' })
  @ApiQuery({ format: 'uuid', name: 'artistId', type: String })
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
}
