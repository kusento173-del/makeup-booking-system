import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { AccessTokenGuard } from '../auth/access-token.guard';
import { ApiErrorResponseDto } from '../auth/auth-openapi.dto';
import type { AccessTokenClaims } from '../auth/auth-session.types';
import { CurrentAuth } from '../auth/current-auth.decorator';
import {
  NotificationSubscriptionGroupDto,
  NotificationSubscriptionRecordedDto,
  RecordNotificationSubscriptionRequestDto,
} from './notification-subscription-openapi.dto';
import { parseNotificationSubscriptionRequest } from './notification-subscription-request.parser';
import { NotificationSubscriptionService } from './notification-subscription.service';
import type {
  NotificationSubscriptionGroup,
  NotificationSubscriptionRecorded,
} from './notification-subscription.types';

@ApiTags('通知订阅')
@ApiBearerAuth('access-token')
@ApiBadRequestResponse({ type: ApiErrorResponseDto })
@ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
@ApiForbiddenResponse({ type: ApiErrorResponseDto })
@UseGuards(AccessTokenGuard)
@Controller('notification-subscriptions')
export class NotificationSubscriptionController {
  constructor(private readonly subscriptions: NotificationSubscriptionService) {}

  @Get('templates')
  @ApiOperation({ summary: '读取当前小程序角色需要订阅的生效模板分组' })
  @ApiOkResponse({ isArray: true, type: NotificationSubscriptionGroupDto })
  list(
    @CurrentAuth() authorization: AccessTokenClaims,
  ): Promise<readonly NotificationSubscriptionGroup[]> {
    return this.subscriptions.listActive(authorization);
  }

  @Post('decisions')
  @HttpCode(200)
  @ApiOperation({ summary: '记录微信订阅弹窗返回结果，不推断剩余发送次数' })
  @ApiBody({ type: RecordNotificationSubscriptionRequestDto })
  @ApiOkResponse({ type: NotificationSubscriptionRecordedDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  record(
    @Body() body: unknown,
    @CurrentAuth() authorization: AccessTokenClaims,
  ): Promise<NotificationSubscriptionRecorded> {
    return this.subscriptions.record(authorization, parseNotificationSubscriptionRequest(body));
  }
}
