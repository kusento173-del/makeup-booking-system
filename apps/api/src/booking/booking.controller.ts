import { Body, Controller, Get, Headers, Ip, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
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
import { BookingCreateService } from './booking-create.service';
import type { BookingCommandContext, BookingCreateResult } from './booking-create.types';
import {
  BookingCreateResultDto,
  BookingSlotResultDto,
  CreateBookingRequestDto,
} from './booking-openapi.dto';
import { parseBookingSlotsRequest, parseCreateBookingRequest } from './booking-request.parser';
import { BookingSlotService } from './booking-slot.service';
import type { BookingSlotResult } from './booking-slot.types';

@ApiTags('化妆预约')
@ApiBearerAuth('access-token')
@ApiBadRequestResponse({ type: ApiErrorResponseDto })
@ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
@ApiForbiddenResponse({ type: ApiErrorResponseDto })
@UseGuards(AccessTokenGuard)
@Controller()
export class BookingController {
  constructor(
    private readonly contexts: MasterDataCommandContextService,
    private readonly creator: BookingCreateService,
    private readonly slots: BookingSlotService,
  ) {}

  @Get('booking-slots')
  @ApiOperation({ summary: '查询主播与化妆师指定日期的可预约档期' })
  @ApiQuery({ format: 'uuid', name: 'artistId', type: String })
  @ApiQuery({ format: 'date', name: 'date', type: String })
  @ApiQuery({ enum: [15, 30, 45, 60], name: 'durationMinutes', type: Number })
  @ApiQuery({ format: 'uuid', name: 'hostId', type: String })
  @ApiOkResponse({ type: BookingSlotResultDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  listSlots(
    @Query() query: unknown,
    @CurrentAuth() authorization: AccessTokenClaims,
  ): Promise<BookingSlotResult> {
    return this.slots.getSlots(authorization, parseBookingSlotsRequest(query));
  }

  @Post('appointments')
  @ApiOperation({ summary: '创建单次化妆预约' })
  @ApiHeader({
    description: '同一用户内唯一，建议使用 UUID',
    name: 'Idempotency-Key',
    required: true,
  })
  @ApiBody({ type: CreateBookingRequestDto })
  @ApiCreatedResponse({ type: BookingCreateResultDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  async create(
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentAuth() authorization: AccessTokenClaims,
    @Ip() ipAddress: string,
    @Headers('user-agent') userAgent?: string,
    @Headers('x-request-id') requestId?: string,
  ): Promise<BookingCreateResult> {
    const command = parseCreateBookingRequest(body, idempotencyKey);
    const context = await this.context(authorization, ipAddress, userAgent, requestId);
    return this.creator.create(context, command);
  }

  private context(
    authorization: AccessTokenClaims,
    ipAddress: string,
    userAgent?: string,
    requestId?: string,
  ): Promise<BookingCommandContext> {
    return this.contexts.resolve(authorization, {
      clientType: ['HOST', 'OPERATOR'].includes(authorization.roleCode)
        ? 'WECHAT_MINI_PROGRAM'
        : 'ADMIN_WEB',
      ipAddress,
      ...(requestId ? { requestId } : {}),
      ...(userAgent ? { userAgent } : {}),
    });
  }
}
