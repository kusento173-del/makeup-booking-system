import { Body, Controller, Get, Headers, Ip, Param, Post, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { AccessTokenGuard } from '../auth/access-token.guard';
import { ApiErrorResponseDto } from '../auth/auth-openapi.dto';
import type { AccessTokenClaims } from '../auth/auth-session.types';
import { CurrentAuth } from '../auth/current-auth.decorator';
import { MasterDataCommandContextService } from '../master-data/master-data-command-context.service';
import {
  ActivateNotificationTemplateRequestDto,
  CreateNotificationTemplateRequestDto,
  NotificationTemplatePreviewDto,
  NotificationTemplateSummaryDto,
  RetireNotificationTemplateRequestDto,
} from './notification-template-openapi.dto';
import {
  parseActivateNotificationTemplateRequest,
  parseCreateNotificationTemplateRequest,
  parseNotificationTemplateId,
  parseRetireNotificationTemplateRequest,
} from './notification-template-request.parser';
import { NotificationTemplateService } from './notification-template.service';
import type {
  NotificationTemplateCommandContext,
  NotificationTemplatePreview,
  NotificationTemplateSummary,
} from './notification-template.types';

@ApiTags('通知模板')
@ApiBearerAuth('access-token')
@ApiBadRequestResponse({ type: ApiErrorResponseDto })
@ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
@ApiForbiddenResponse({ type: ApiErrorResponseDto })
@UseGuards(AccessTokenGuard)
@Controller('notification-templates')
export class NotificationTemplateController {
  constructor(
    private readonly contexts: MasterDataCommandContextService,
    private readonly templates: NotificationTemplateService,
  ) {}

  @Get()
  @ApiOperation({ summary: '查询小程序通知模板版本' })
  @ApiOkResponse({ isArray: true, type: NotificationTemplateSummaryDto })
  list(
    @CurrentAuth() authorization: AccessTokenClaims,
  ): Promise<readonly NotificationTemplateSummary[]> {
    return this.templates.list(authorization);
  }

  @Get(':templateId/preview')
  @ApiOperation({ summary: '使用脱敏示例数据预览模板字段映射' })
  @ApiOkResponse({ type: NotificationTemplatePreviewDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  preview(
    @Param('templateId') templateId: unknown,
    @CurrentAuth() authorization: AccessTokenClaims,
  ): Promise<NotificationTemplatePreview> {
    return this.templates.preview(authorization, parseNotificationTemplateId(templateId));
  }

  @Post()
  @ApiOperation({ summary: '管理员新建通知模板草稿版本' })
  @ApiBody({ type: CreateNotificationTemplateRequestDto })
  @ApiCreatedResponse({ type: NotificationTemplateSummaryDto })
  async create(
    @Body() body: unknown,
    @CurrentAuth() authorization: AccessTokenClaims,
    @Ip() ipAddress: string,
    @Headers('user-agent') userAgent?: string,
    @Headers('x-request-id') requestId?: string,
  ): Promise<NotificationTemplateSummary> {
    const context = await this.context(authorization, ipAddress, userAgent, requestId);
    return this.templates.createDraft(context, parseCreateNotificationTemplateRequest(body));
  }

  @Post(':templateId/activate')
  @ApiOperation({ summary: '管理员启用草稿并原子退役原生效版本' })
  @ApiBody({ type: ActivateNotificationTemplateRequestDto })
  @ApiOkResponse({ type: NotificationTemplateSummaryDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  async activate(
    @Param('templateId') templateId: unknown,
    @Body() body: unknown,
    @CurrentAuth() authorization: AccessTokenClaims,
    @Ip() ipAddress: string,
    @Headers('user-agent') userAgent?: string,
    @Headers('x-request-id') requestId?: string,
  ): Promise<NotificationTemplateSummary> {
    const context = await this.context(authorization, ipAddress, userAgent, requestId);
    return this.templates.activate(
      context,
      parseNotificationTemplateId(templateId),
      parseActivateNotificationTemplateRequest(body),
    );
  }

  @Post(':templateId/retire')
  @ApiOperation({ summary: '管理员退役当前生效模板' })
  @ApiBody({ type: RetireNotificationTemplateRequestDto })
  @ApiOkResponse({ type: NotificationTemplateSummaryDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  async retire(
    @Param('templateId') templateId: unknown,
    @Body() body: unknown,
    @CurrentAuth() authorization: AccessTokenClaims,
    @Ip() ipAddress: string,
    @Headers('user-agent') userAgent?: string,
    @Headers('x-request-id') requestId?: string,
  ): Promise<NotificationTemplateSummary> {
    const context = await this.context(authorization, ipAddress, userAgent, requestId);
    return this.templates.retire(
      context,
      parseNotificationTemplateId(templateId),
      parseRetireNotificationTemplateRequest(body),
    );
  }

  private context(
    authorization: AccessTokenClaims,
    ipAddress: string,
    userAgent?: string,
    requestId?: string,
  ): Promise<NotificationTemplateCommandContext> {
    return this.contexts.resolve(authorization, {
      clientType: 'ADMIN_WEB',
      ipAddress,
      ...(requestId ? { requestId } : {}),
      ...(userAgent ? { userAgent } : {}),
    });
  }
}
