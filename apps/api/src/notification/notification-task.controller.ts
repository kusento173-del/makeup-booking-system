import { Body, Controller, Get, Headers, Ip, Param, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
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
import { MasterDataCommandContextService } from '../master-data/master-data-command-context.service';
import {
  NotificationTaskPageDto,
  RetriedNotificationTaskDto,
  RetryNotificationTaskRequestDto,
} from './notification-task-openapi.dto';
import {
  parseNotificationTaskId,
  parseNotificationTaskListRequest,
  parseRetryNotificationTaskRequest,
} from './notification-task-request.parser';
import { NotificationTaskService } from './notification-task.service';
import type { NotificationTaskPage } from './notification-task.types';

@ApiTags('通知任务')
@ApiBearerAuth('access-token')
@ApiBadRequestResponse({ type: ApiErrorResponseDto })
@ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
@ApiForbiddenResponse({ type: ApiErrorResponseDto })
@UseGuards(AccessTokenGuard)
@Controller('notification-tasks')
export class NotificationTaskController {
  constructor(
    private readonly contexts: MasterDataCommandContextService,
    private readonly tasks: NotificationTaskService,
  ) {}

  @Get()
  @ApiOperation({ summary: '按后台角色权限查询脱敏通知任务' })
  @ApiOkResponse({ type: NotificationTaskPageDto })
  @ApiQuery({ format: 'date', name: 'date', required: false, type: String })
  @ApiQuery({ minimum: 1, name: 'page', required: false, type: Number })
  @ApiQuery({ maximum: 100, minimum: 1, name: 'pageSize', required: false, type: Number })
  @ApiQuery({
    enum: ['HOST', 'ARTIST', 'OPERATOR'],
    name: 'recipientRoleCode',
    required: false,
  })
  @ApiQuery({ maxLength: 64, name: 'search', required: false, type: String })
  @ApiQuery({
    enum: ['PENDING', 'PROCESSING', 'RETRY_WAIT', 'SUCCEEDED', 'FAILED', 'CANCELLED'],
    name: 'status',
    required: false,
  })
  list(
    @Query() query: unknown,
    @CurrentAuth() authorization: AccessTokenClaims,
  ): Promise<NotificationTaskPage> {
    return this.tasks.list(authorization, parseNotificationTaskListRequest(query));
  }

  @Post(':taskId/retry')
  @ApiOperation({ summary: '为可重试失败通知建立新的人工重试任务' })
  @ApiBody({ type: RetryNotificationTaskRequestDto })
  @ApiOkResponse({ type: RetriedNotificationTaskDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  async retry(
    @Param('taskId') taskId: unknown,
    @Body() body: unknown,
    @CurrentAuth() authorization: AccessTokenClaims,
    @Ip() ipAddress: string,
    @Headers('user-agent') userAgent?: string,
    @Headers('x-request-id') requestId?: string,
  ): Promise<{ readonly id: string }> {
    const context = await this.contexts.resolve(authorization, {
      clientType: 'ADMIN_WEB',
      ipAddress,
      ...(requestId ? { requestId } : {}),
      ...(userAgent ? { userAgent } : {}),
    });
    return this.tasks.retry(
      context,
      parseNotificationTaskId(taskId),
      parseRetryNotificationTaskRequest(body),
    );
  }
}
