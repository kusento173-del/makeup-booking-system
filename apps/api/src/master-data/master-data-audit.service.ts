import type { Prisma } from '@makeup/database';
import { Injectable } from '@nestjs/common';

import { AuditEntryFactory } from '../audit/audit-entry.factory';
import { AuditLogRepository } from '../audit/audit-log.repository';
import type { AuditSnapshot } from '../audit/audit.types';
import type { MasterDataCommandContext } from './master-data-command.types';

export interface MasterDataAuditEntry {
  readonly action: string;
  readonly afterData?: AuditSnapshot | undefined;
  readonly beforeData?: AuditSnapshot | undefined;
  readonly objectId: string;
  readonly objectType: string;
  readonly reason?: string | undefined;
  readonly siteId: string;
}

@Injectable()
export class MasterDataAuditService {
  constructor(
    private readonly auditFactory: AuditEntryFactory,
    private readonly auditLogs: AuditLogRepository,
  ) {}

  append(
    transaction: Prisma.TransactionClient,
    context: MasterDataCommandContext,
    entry: MasterDataAuditEntry,
  ): Promise<string> {
    return this.auditLogs.append(
      transaction,
      this.auditFactory.create({
        ...entry,
        actorName: context.actorName,
        actorRole: context.roleCode,
        actorUserId: context.userId,
        clientType: context.clientType,
        ipAddress: context.ipAddress,
        requestId: context.requestId,
        userAgent: context.userAgent,
      }),
    );
  }
}
