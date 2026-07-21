import { Prisma } from '@makeup/database';
import { Injectable } from '@nestjs/common';

import type { AuditEntryDraft } from './audit.types';

@Injectable()
export class AuditLogRepository {
  async append(transaction: Prisma.TransactionClient, entry: AuditEntryDraft): Promise<string> {
    const log = await transaction.operationLog.create({
      data: {
        action: entry.action,
        actorNameSnapshot: entry.actorNameSnapshot,
        actorRole: entry.actorRole,
        actorUserId: entry.actorUserId,
        afterData: entry.afterData ?? Prisma.DbNull,
        beforeData: entry.beforeData ?? Prisma.DbNull,
        clientType: entry.clientType,
        ipAddress: entry.ipAddress,
        objectId: entry.objectId,
        objectType: entry.objectType,
        reason: entry.reason,
        requestId: entry.requestId,
        siteId: entry.siteId,
        userAgent: entry.userAgent,
      },
      select: { id: true },
    });

    return log.id;
  }
}
