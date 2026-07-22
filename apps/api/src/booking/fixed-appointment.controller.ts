import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
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
import { parseFixedAvailabilityRequest } from './booking-request.parser';
import { FixedAvailabilityResultDto } from './booking-openapi.dto';
import { FixedAvailabilityService } from './fixed-availability.service';
import type { FixedAvailabilityResult } from './fixed-availability.types';

@ApiTags('固定化妆预约')
@ApiBearerAuth('access-token')
@ApiBadRequestResponse({ type: ApiErrorResponseDto })
@ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
@ApiForbiddenResponse({ type: ApiErrorResponseDto })
@UseGuards(AccessTokenGuard)
@Controller('fixed-appointments')
export class FixedAppointmentController {
  constructor(private readonly availability: FixedAvailabilityService) {}

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
}
