import { Prisma } from '@makeup/database';
import { Injectable } from '@nestjs/common';

import {
  AuthorizationDeniedError,
  AuthorizationPolicyService,
} from '../auth/authorization-policy.service';
import type { VerifiedAuthorizationContext } from '../auth/authorization.types';
import { DatabaseService } from '../database/database.service';
import type { AuditJsonValue } from './audit.types';
import type { AuditLogPage, AuditQueryInput } from './audit-query.types';

@Injectable()
export class AuditQueryService {
  constructor(
    private readonly authorization: AuthorizationPolicyService,
    private readonly database: DatabaseService,
  ) {}

  list(context: VerifiedAuthorizationContext, input: AuditQueryInput): Promise<AuditLogPage> {
    this.authorization.assertRole(context, ['CUSTOMER_SERVICE', 'ADMIN']);
    const where = this.scope(context, input);
    return this.database.read(async (client) => {
      const [items, total] = await Promise.all([
        client.operationLog.findMany({
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          select: {
            action: true,
            actorNameSnapshot: true,
            actorRole: true,
            afterData: true,
            beforeData: true,
            createdAt: true,
            id: true,
            objectId: true,
            objectType: true,
            reason: true,
            site: { select: { name: true } },
            siteId: true,
          },
          skip: (input.page - 1) * input.pageSize,
          take: input.pageSize,
          where,
        }),
        client.operationLog.count({ where }),
      ]);
      return {
        items: items.map((item) => ({
          action: item.action,
          actorName: item.actorNameSnapshot,
          actorRole: item.actorRole,
          afterData: item.afterData as AuditJsonValue | null,
          beforeData: item.beforeData as AuditJsonValue | null,
          createdAt: item.createdAt.toISOString(),
          id: item.id,
          objectId: item.objectId,
          objectType: item.objectType,
          reason: item.reason,
          siteId: item.siteId,
          siteName: item.site?.name ?? null,
        })),
        page: input.page,
        pageSize: input.pageSize,
        total,
      };
    });
  }

  private scope(
    context: VerifiedAuthorizationContext,
    input: AuditQueryInput,
  ): Prisma.OperationLogWhereInput {
    const filters = {
      ...(input.action ? { action: input.action } : {}),
      ...(input.objectType ? { objectType: input.objectType } : {}),
    };
    if (context.roleCode === 'ADMIN') {
      return { ...filters, ...(input.siteId ? { siteId: input.siteId } : {}) };
    }
    if (context.roleCode === 'CUSTOMER_SERVICE' && context.siteId) {
      if (input.siteId && input.siteId !== context.siteId) throw new AuthorizationDeniedError();
      return { ...filters, siteId: context.siteId };
    }
    throw new AuthorizationDeniedError();
  }
}
