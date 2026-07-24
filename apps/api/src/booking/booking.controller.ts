import { Body, Controller, Get, Headers, Ip, Param, Post, Query, UseGuards } from '@nestjs/common';
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
import { AppointmentQueryService } from './appointment-query.service';
import type { AppointmentPage } from './appointment-query.types';
import { BookingCancelService } from './booking-cancel.service';
import { BookingCreateService } from './booking-create.service';
import type {
  BookingCancellationResult,
  BookingCommandContext,
  BookingCreateResult,
  BookingRescheduleResult,
} from './booking-create.types';
import {
  BookingCancellationResultDto,
  BookingCreateResultDto,
  BookingRescheduleResultDto,
  BookingSlotResultDto,
  CancelBookingRequestDto,
  CreateBookingRequestDto,
  RescheduleBookingRequestDto,
  AppointmentPageDto,
} from './booking-openapi.dto';
import {
  parseBookingSlotsRequest,
  parseAppointmentListRequest,
  parseCancelBookingRequest,
  parseCreateBookingRequest,
  parseRescheduleBookingRequest,
} from './booking-request.parser';
import { BookingRescheduleService } from './booking-reschedule.service';
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
    private readonly appointmentQueries: AppointmentQueryService,
    private readonly canceller: BookingCancelService,
    private readonly contexts: MasterDataCommandContextService,
    private readonly creator: BookingCreateService,
    private readonly rescheduler: BookingRescheduleService,
    private readonly slots: BookingSlotService,
  ) {}

  @Get('appointments')
  @ApiOperation({ summary: '按角色范围查询今日、未来或历史预约' })
  @ApiQuery({ format: 'date', name: 'fromDate', required: false, type: String })
  @ApiQuery({ format: 'uuid', name: 'hostId', required: false, type: String })
  @ApiQuery({ format: 'date', name: 'toDate', required: false, type: String })
  @ApiQuery({ minimum: 1, name: 'page', required: false, type: Number })
  @ApiQuery({ maximum: 100, minimum: 1, name: 'pageSize', required: false, type: Number })
  @ApiQuery({ enum: ['BOOKED', 'CANCELLED', 'COMPLETED'], name: 'status', required: false })
  @ApiOkResponse({ type: AppointmentPageDto })
  listAppointments(
    @Query() query: unknown,
    @CurrentAuth() authorization: AccessTokenClaims,
  ): Promise<AppointmentPage> {
    return this.appointmentQueries.list(authorization, parseAppointmentListRequest(query));
  }

  @Post('appointments/:appointmentId/cancel')
  @ApiOperation({ summary: '取消化妆预约' })
  @ApiBody({ type: CancelBookingRequestDto })
  @ApiOkResponse({ type: BookingCancellationResultDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  async cancel(
    @Param('appointmentId') appointmentId: string,
    @Body() body: unknown,
    @CurrentAuth() authorization: AccessTokenClaims,
    @Ip() ipAddress: string,
    @Headers('user-agent') userAgent?: string,
    @Headers('x-request-id') requestId?: string,
  ): Promise<BookingCancellationResult> {
    const command = parseCancelBookingRequest(appointmentId, body);
    const context = await this.context(authorization, ipAddress, userAgent, requestId);
    return this.canceller.cancel(context, command);
  }

  @Post('appointments/:appointmentId/reschedule')
  @ApiOperation({ summary: '改期或更换实际预约化妆师' })
  @ApiHeader({
    description: '同一用户内唯一，建议使用 UUID',
    name: 'Idempotency-Key',
    required: true,
  })
  @ApiBody({ type: RescheduleBookingRequestDto })
  @ApiCreatedResponse({ type: BookingRescheduleResultDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  async reschedule(
    @Param('appointmentId') appointmentId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentAuth() authorization: AccessTokenClaims,
    @Ip() ipAddress: string,
    @Headers('user-agent') userAgent?: string,
    @Headers('x-request-id') requestId?: string,
  ): Promise<BookingRescheduleResult> {
    const command = parseRescheduleBookingRequest(appointmentId, body, idempotencyKey);
    const context = await this.context(authorization, ipAddress, userAgent, requestId);
    return this.rescheduler.reschedule(context, command);
  }

  @Get('booking-slots')
  @ApiOperation({ summary: '查询主播与化妆师指定日期的可预约档期' })
  @ApiQuery({ format: 'uuid', name: 'artistId', type: String })
  @ApiQuery({ format: 'date', name: 'date', type: String })
  @ApiQuery({ enum: [15, 30, 45, 60], name: 'durationMinutes', type: Number })
  @ApiQuery({ format: 'uuid', name: 'excludeAppointmentId', required: false, type: String })
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
