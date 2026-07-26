import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Ip,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  getSchemaPath,
} from '@nestjs/swagger';

import { ApiErrorResponseDto } from '../auth/auth-openapi.dto';
import { AccessTokenGuard } from '../auth/access-token.guard';
import type { AccessTokenClaims } from '../auth/auth-session.types';
import { CurrentAuth } from '../auth/current-auth.decorator';
import { MasterDataCommandContextService } from '../master-data/master-data-command-context.service';
import { ShiftChangeService } from './shift-change.service';
import {
  ArtistShiftDto,
  ReviewShiftChangeRequestDto,
  ShiftChangePageDto,
  WithdrawShiftChangeRequestDto,
} from './shift-openapi.dto';
import {
  parseReviewShiftChangeRequest,
  parseShiftChangeListRequest,
  parseWithdrawShiftChangeRequest,
} from './shift-request.parser';
import type { ArtistShiftSummary, ShiftChangePage } from './shift.types';

@ApiTags('班次修改申请')
@ApiBearerAuth('access-token')
@ApiBadRequestResponse({ type: ApiErrorResponseDto })
@ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
@ApiForbiddenResponse({ type: ApiErrorResponseDto })
@UseGuards(AccessTokenGuard)
@Controller('shift-changes')
export class ShiftChangeController {
  constructor(
    private readonly contexts: MasterDataCommandContextService,
    private readonly changes: ShiftChangeService,
  ) {}

  @Get()
  @ApiOperation({ summary: '按本人或后台场地范围查询班次修改申请' })
  @ApiOkResponse({ type: ShiftChangePageDto })
  list(
    @Query() query: unknown,
    @CurrentAuth() authorization: AccessTokenClaims,
  ): Promise<ShiftChangePage> {
    return this.changes.list(authorization, parseShiftChangeListRequest(query));
  }

  @Post(':requestId/withdraw')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '化妆师撤回本人待审核班次修改' })
  @ApiBody({ type: WithdrawShiftChangeRequestDto })
  @ApiNoContentResponse()
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  async withdraw(
    @Param('requestId') requestId: string,
    @Body() body: unknown,
    @CurrentAuth() authorization: AccessTokenClaims,
    @Ip() ipAddress: string,
    @Headers('user-agent') userAgent?: string,
    @Headers('x-request-id') traceId?: string,
  ): Promise<void> {
    const command = parseWithdrawShiftChangeRequest(requestId, body);
    const context = await this.context(authorization, ipAddress, userAgent, traceId);
    await this.changes.withdraw(context, command);
  }

  @Post(':requestId/review')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '客服或管理员审核班次修改申请' })
  @ApiBody({ type: ReviewShiftChangeRequestDto })
  @ApiOkResponse({
    schema: { allOf: [{ $ref: getSchemaPath(ArtistShiftDto) }], nullable: true },
  })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  async review(
    @Param('requestId') requestId: string,
    @Body() body: unknown,
    @CurrentAuth() authorization: AccessTokenClaims,
    @Ip() ipAddress: string,
    @Headers('user-agent') userAgent?: string,
    @Headers('x-request-id') traceId?: string,
  ): Promise<ArtistShiftSummary | null> {
    const command = parseReviewShiftChangeRequest(requestId, body);
    const context = await this.context(authorization, ipAddress, userAgent, traceId);
    return this.changes.review(context, command);
  }

  private context(
    authorization: AccessTokenClaims,
    ipAddress: string,
    userAgent?: string,
    requestId?: string,
  ) {
    return this.contexts.resolve(authorization, {
      clientType: authorization.roleCode === 'ARTIST' ? 'WECHAT_MINI_PROGRAM' : 'ADMIN_WEB',
      ipAddress,
      ...(requestId ? { requestId } : {}),
      ...(userAgent ? { userAgent } : {}),
    });
  }
}
