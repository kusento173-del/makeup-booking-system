import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
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
import { AuditLogPageDto } from './audit-query-openapi.dto';
import { parseAuditQuery } from './audit-query.parser';
import { AuditQueryService } from './audit-query.service';
import type { AuditLogPage } from './audit-query.types';

@ApiTags('操作记录')
@ApiBearerAuth('access-token')
@ApiBadRequestResponse({ type: ApiErrorResponseDto })
@ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
@ApiForbiddenResponse({ type: ApiErrorResponseDto })
@UseGuards(AccessTokenGuard)
@Controller('operation-logs')
export class AuditQueryController {
  constructor(private readonly queries: AuditQueryService) {}

  @Get()
  @ApiOperation({ summary: '按角色和场地权限分页查看只读操作记录' })
  @ApiOkResponse({ type: AuditLogPageDto })
  list(
    @Query() query: unknown,
    @CurrentAuth() authorization: AccessTokenClaims,
  ): Promise<AuditLogPage> {
    return this.queries.list(authorization, parseAuditQuery(query));
  }
}
