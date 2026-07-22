import type { Prisma } from '@makeup/database';
import { Injectable } from '@nestjs/common';

import { AuditEntryFactory } from './audit-entry.factory';
import { AuditLogRepository } from './audit-log.repository';
import type { AuditActorRole, AuditSnapshot } from './audit.types';

export interface AuditCommandContext {
  readonly actorName: string;
  readonly clientType?: string;
  readonly ipAddress?: string;
  readonly requestId?: string;
  readonly roleCode: AuditActorRole;
  readonly userAgent?: string;
  readonly userId?: string;
}

export interface AuditCommandEntry {
  readonly action: string;
  readonly afterData?: AuditSnapshot | undefined;
  readonly beforeData?: AuditSnapshot | undefined;
  readonly objectId: string;
  readonly objectType: string;
  readonly reason?: string | undefined;
  readonly siteId?: string | undefined;
}

@Injectable()
export class AuditCommandService {
  constructor(
    private readonly auditFactory: AuditEntryFactory,
    private readonly auditLogs: AuditLogRepository,
  ) {}

  append(
    transaction: Prisma.TransactionClient,
    context: AuditCommandContext,
    entry: AuditCommandEntry,
  ): Promise<string> {
    return this.auditLogs.append(
      transaction,
      this.auditFactory.create({
        ...entry,
        actorName: context.actorName,
        actorRole: context.roleCode,
        ...(context.userId ? { actorUserId: context.userId } : {}),
        clientType: context.clientType,
        ipAddress: context.ipAddress,
        requestId: context.requestId,
        userAgent: context.userAgent,
      }),
    );
  }
}
