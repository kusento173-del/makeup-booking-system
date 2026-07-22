import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Ip,
  Param,
  Post,
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
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { AccessTokenGuard } from '../auth/access-token.guard';
import { ApiErrorResponseDto } from '../auth/auth-openapi.dto';
import type { AccessTokenClaims } from '../auth/auth-session.types';
import { CurrentAuth } from '../auth/current-auth.decorator';
import { MasterDataCommandContextService } from '../master-data/master-data-command-context.service';
import {
  CancelLeaveRequestDto,
  CreateLeaveRequestDto,
  LeaveImpactPreviewDto,
  LeavePreviewRequestDto,
  LeaveSummaryDto,
} from './leave-openapi.dto';
import {
  parseCancelLeaveRequest,
  parseCreateLeaveRequest,
  parseLeavePreviewRequest,
} from './leave-request.parser';
import { LeaveService } from './leave.service';
import type { LeaveCommandContext, LeaveImpactPreview, LeaveSummary } from './leave.types';

@ApiTags('请假')
@ApiBearerAuth('access-token')
@ApiBadRequestResponse({ type: ApiErrorResponseDto })
@ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
@ApiForbiddenResponse({ type: ApiErrorResponseDto })
@UseGuards(AccessTokenGuard)
@Controller('leaves')
export class LeaveController {
  constructor(
    private readonly contexts: MasterDataCommandContextService,
    private readonly leaves: LeaveService,
  ) {}

  @Post('preview')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '预览本人请假影响' })
  @ApiBody({ type: LeavePreviewRequestDto })
  @ApiOkResponse({ type: LeaveImpactPreviewDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  preview(
    @Body() body: unknown,
    @CurrentAuth() authorization: AccessTokenClaims,
    @Ip() ipAddress: string,
  ): Promise<LeaveImpactPreview> {
    const command = parseLeavePreviewRequest(body);
    return this.context(authorization, ipAddress).then((context) =>
      this.leaves.preview(context, command),
    );
  }

  @Post()
  @ApiOperation({ summary: '确认本人请假' })
  @ApiBody({ type: CreateLeaveRequestDto })
  @ApiCreatedResponse({ type: LeaveSummaryDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  create(
    @Body() body: unknown,
    @CurrentAuth() authorization: AccessTokenClaims,
    @Ip() ipAddress: string,
    @Headers('user-agent') userAgent?: string,
    @Headers('x-request-id') requestId?: string,
  ): Promise<LeaveSummary> {
    const command = parseCreateLeaveRequest(body);
    return this.context(authorization, ipAddress, userAgent, requestId).then((context) =>
      this.leaves.create(context, command),
    );
  }

  @Post(':leaveId/cancel')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '取消尚未开始的请假' })
  @ApiBody({ type: CancelLeaveRequestDto })
  @ApiNoContentResponse()
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  cancel(
    @Param('leaveId') leaveId: string,
    @Body() body: unknown,
    @CurrentAuth() authorization: AccessTokenClaims,
    @Ip() ipAddress: string,
    @Headers('user-agent') userAgent?: string,
    @Headers('x-request-id') requestId?: string,
  ): Promise<void> {
    const command = parseCancelLeaveRequest(leaveId, body);
    return this.context(authorization, ipAddress, userAgent, requestId).then((context) =>
      this.leaves.cancel(context, command),
    );
  }

  private context(
    authorization: AccessTokenClaims,
    ipAddress: string,
    userAgent?: string,
    requestId?: string,
  ): Promise<LeaveCommandContext> {
    return this.contexts.resolve(authorization, {
      clientType: ['HOST', 'ARTIST'].includes(authorization.roleCode)
        ? 'WECHAT_MINI_PROGRAM'
        : 'ADMIN_WEB',
      ipAddress,
      ...(requestId ? { requestId } : {}),
      ...(userAgent ? { userAgent } : {}),
    });
  }
}
