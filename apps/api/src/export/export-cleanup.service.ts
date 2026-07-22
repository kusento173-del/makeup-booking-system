import { rm } from 'node:fs/promises';

import { Prisma } from '@makeup/database';
import { Injectable } from '@nestjs/common';

import { AuditCommandService } from '../audit/audit-command.service';
import { DatabaseService } from '../database/database.service';
import { localExportStoragePath } from './export-storage';

interface ExpiredExport {
  readonly id: string;
  readonly rowVersion: number;
  readonly siteId: string | null;
  readonly storageKey: string;
}

export interface ExportCleanupResult {
  readonly cleaned: boolean;
  readonly exportJobId: string | null;
}

@Injectable()
export class ExportCleanupService {
  constructor(
    private readonly audit: AuditCommandService,
    private readonly database: DatabaseService,
  ) {}

  runOne(now = new Date()): Promise<ExportCleanupResult> {
    return this.database.transaction(async (transaction) => {
      const jobs = await transaction.$queryRaw<ExpiredExport[]>(Prisma.sql`
        SELECT "id", "row_version" AS "rowVersion", "site_id" AS "siteId", "storage_key" AS "storageKey"
        FROM "export_jobs"
        WHERE "status" = 'SUCCEEDED'
          AND "expires_at" <= ${now}
          AND "storage_deleted_at" IS NULL
        ORDER BY "expires_at", "id"
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      `);
      const job = jobs[0];
      if (!job) return { cleaned: false, exportJobId: null };

      await rm(localExportStoragePath(job.id, job.storageKey), { force: true });
      const updated = await transaction.exportJob.updateMany({
        data: { rowVersion: { increment: 1 }, storageDeletedAt: now },
        where: {
          expiresAt: { lte: now },
          id: job.id,
          rowVersion: job.rowVersion,
          status: 'SUCCEEDED',
          storageDeletedAt: null,
        },
      });
      if (updated.count !== 1) throw new Error('Export cleanup conflicted');
      await this.audit.append(
        transaction,
        { actorName: '排班导出清理任务', roleCode: 'SYSTEM' },
        {
          action: 'SCHEDULE_EXPORT_FILE_DELETED',
          afterData: { storageDeletedAt: now.toISOString() },
          objectId: job.id,
          objectType: 'EXPORT_JOB',
          ...(job.siteId ? { siteId: job.siteId } : {}),
        },
      );
      return { cleaned: true, exportJobId: job.id };
    });
  }
}
