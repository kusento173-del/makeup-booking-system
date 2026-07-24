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
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
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
  ArtistUnavailablePeriodPreviewDto,
  ArtistUnavailablePeriodRangeDto,
  ArtistUnavailablePeriodSummaryDto,
  CancelArtistUnavailablePeriodRequestDto,
  CreateArtistUnavailablePeriodRequestDto,
} from './artist-unavailability-openapi.dto';
import {
  parseArtistUnavailablePeriodPreviewRequest,
  parseArtistUnavailablePeriodTarget,
  parseCancelArtistUnavailablePeriodRequest,
  parseCreateArtistUnavailablePeriodRequest,
} from './artist-unavailability-request.parser';
import { ArtistUnavailabilityService } from './artist-unavailability.service';
import type {
  ArtistUnavailablePeriodPreview,
  ArtistUnavailablePeriodSummary,
  ArtistUnavailabilityCommandContext,
} from './artist-unavailability.types';

@ApiTags('化妆师临时不可排班')
@ApiBearerAuth('access-token')
@ApiBadRequestResponse({ type: ApiErrorResponseDto })
@ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
@ApiForbiddenResponse({ type: ApiErrorResponseDto })
@UseGuards(AccessTokenGuard)
@Controller('artist-unavailable-periods')
export class ArtistUnavailabilityController {
  constructor(
    private readonly contexts: MasterDataCommandContextService,
    private readonly unavailability: ArtistUnavailabilityService,
  ) {}

  @Post('preview')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '预览临时不可排班时段影响' })
  @ApiBody({ type: ArtistUnavailablePeriodRangeDto })
  @ApiOkResponse({ type: ArtistUnavailablePeriodPreviewDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  preview(
    @Body() body: unknown,
    @CurrentAuth() authorization: AccessTokenClaims,
    @Ip() ipAddress: string,
  ): Promise<ArtistUnavailablePeriodPreview> {
    const command = parseArtistUnavailablePeriodPreviewRequest(body);
    return this.context(authorization, ipAddress).then((context) =>
      this.unavailability.preview(context, command),
    );
  }

  @Get()
  @ApiOperation({ summary: '查询当前和未来有效临时不可排班时段' })
  @ApiQuery({ format: 'uuid', name: 'artistId', required: false })
  @ApiOkResponse({ type: [ArtistUnavailablePeriodSummaryDto] })
  async list(
    @Query() query: unknown,
    @CurrentAuth() authorization: AccessTokenClaims,
    @Ip() ipAddress: string,
  ): Promise<readonly ArtistUnavailablePeriodSummary[]> {
    const context = await this.context(authorization, ipAddress);
    return this.unavailability.list(context, parseArtistUnavailablePeriodTarget(query));
  }

  @Post()
  @ApiOperation({ summary: '确认临时不可排班时段' })
  @ApiBody({ type: CreateArtistUnavailablePeriodRequestDto })
  @ApiCreatedResponse({ type: ArtistUnavailablePeriodSummaryDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  create(
    @Body() body: unknown,
    @CurrentAuth() authorization: AccessTokenClaims,
    @Ip() ipAddress: string,
    @Headers('user-agent') userAgent?: string,
    @Headers('x-request-id') requestId?: string,
  ): Promise<ArtistUnavailablePeriodSummary> {
    const command = parseCreateArtistUnavailablePeriodRequest(body);
    return this.context(authorization, ipAddress, userAgent, requestId).then((context) =>
      this.unavailability.create(context, command),
    );
  }

  @Post(':periodId/cancel')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '撤销临时不可排班时段' })
  @ApiBody({ type: CancelArtistUnavailablePeriodRequestDto })
  @ApiNoContentResponse()
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  cancel(
    @Param('periodId') periodId: string,
    @Body() body: unknown,
    @CurrentAuth() authorization: AccessTokenClaims,
    @Ip() ipAddress: string,
    @Headers('user-agent') userAgent?: string,
    @Headers('x-request-id') requestId?: string,
  ): Promise<void> {
    const command = parseCancelArtistUnavailablePeriodRequest(periodId, body);
    return this.context(authorization, ipAddress, userAgent, requestId).then((context) =>
      this.unavailability.cancel(context, command),
    );
  }

  private context(
    authorization: AccessTokenClaims,
    ipAddress: string,
    userAgent?: string,
    requestId?: string,
  ): Promise<ArtistUnavailabilityCommandContext> {
    return this.contexts.resolve(authorization, {
      clientType: authorization.roleCode === 'ARTIST' ? 'WECHAT_MINI_PROGRAM' : 'ADMIN_WEB',
      ipAddress,
      ...(requestId ? { requestId } : {}),
      ...(userAgent ? { userAgent } : {}),
    });
  }
}
