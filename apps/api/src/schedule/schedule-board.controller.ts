import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
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
import { ScheduleBoardService } from './schedule-board.service';
import type { ScheduleBoard } from './schedule-board.types';
import { ScheduleBoardDto } from './schedule-openapi.dto';
import { parseScheduleBoardRequest } from './schedule-request.parser';

@ApiTags('排班看板')
@ApiBearerAuth('access-token')
@ApiBadRequestResponse({ type: ApiErrorResponseDto })
@ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
@ApiForbiddenResponse({ type: ApiErrorResponseDto })
@UseGuards(AccessTokenGuard)
@Controller('schedule-board')
export class ScheduleBoardController {
  constructor(private readonly schedules: ScheduleBoardService) {}

  @Get()
  @ApiOperation({ summary: '查询客服或管理员指定场地和日期的化妆排班看板' })
  @ApiQuery({ format: 'date', name: 'date', type: String })
  @ApiQuery({ format: 'uuid', name: 'siteId', required: false, type: String })
  @ApiOkResponse({ type: ScheduleBoardDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  get(
    @Query() query: unknown,
    @CurrentAuth() authorization: AccessTokenClaims,
  ): Promise<ScheduleBoard> {
    return this.schedules.get(authorization, parseScheduleBoardRequest(query));
  }
}
