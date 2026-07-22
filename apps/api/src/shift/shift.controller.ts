import { Body, Controller, Get, Headers, Ip, Param, Post, Query, UseGuards } from '@nestjs/common';
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
  getSchemaPath,
} from '@nestjs/swagger';

import { ApiErrorResponseDto } from '../auth/auth-openapi.dto';
import { AccessTokenGuard } from '../auth/access-token.guard';
import type { AccessTokenClaims } from '../auth/auth-session.types';
import { CurrentAuth } from '../auth/current-auth.decorator';
import { MasterDataCommandContextService } from '../master-data/master-data-command-context.service';
import { ArtistShiftService } from './artist-shift.service';
import { ArtistShiftDto, SetInitialShiftRequestDto } from './shift-openapi.dto';
import {
  assertNoShiftQuery,
  parseArtistId,
  parseInitialShiftRequest,
} from './shift-request.parser';
import type { ArtistShiftSummary } from './shift.types';

@ApiTags('化妆师班次')
@ApiBearerAuth('access-token')
@ApiBadRequestResponse({ type: ApiErrorResponseDto })
@ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
@ApiForbiddenResponse({ type: ApiErrorResponseDto })
@UseGuards(AccessTokenGuard)
@Controller('artists/:artistId/shifts')
export class ShiftController {
  constructor(
    private readonly contexts: MasterDataCommandContextService,
    private readonly shifts: ArtistShiftService,
  ) {}

  @Post('initial')
  @ApiOperation({ summary: '首次设置化妆师班次' })
  @ApiBody({ type: SetInitialShiftRequestDto })
  @ApiCreatedResponse({ type: ArtistShiftDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  async setInitialShift(
    @Param('artistId') artistId: string,
    @Body() body: unknown,
    @CurrentAuth() authorization: AccessTokenClaims,
    @Ip() ipAddress: string,
    @Headers('user-agent') userAgent?: string,
    @Headers('x-request-id') requestId?: string,
  ): Promise<ArtistShiftSummary> {
    const command = parseInitialShiftRequest(artistId, body);
    const context = await this.contexts.resolve(authorization, {
      clientType: authorization.roleCode === 'ARTIST' ? 'WECHAT_MINI_PROGRAM' : 'ADMIN_WEB',
      ipAddress,
      ...(requestId ? { requestId } : {}),
      ...(userAgent ? { userAgent } : {}),
    });
    return this.shifts.setInitialShift(context, command);
  }

  @Get('current')
  @ApiOperation({ summary: '查看当前生效的完整班次' })
  @ApiOkResponse({
    schema: {
      allOf: [{ $ref: getSchemaPath(ArtistShiftDto) }],
      nullable: true,
    },
  })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  getCurrentShift(
    @Param('artistId') artistId: string,
    @Query() query: unknown,
    @CurrentAuth() authorization: AccessTokenClaims,
  ): Promise<ArtistShiftSummary | null> {
    assertNoShiftQuery(query);
    return this.shifts.getCurrentShift(authorization, parseArtistId(artistId));
  }
}
