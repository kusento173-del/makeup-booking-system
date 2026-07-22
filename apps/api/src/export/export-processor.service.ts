import { createHash, randomUUID } from 'node:crypto';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';

import { Prisma } from '@makeup/database';
import { Injectable, Logger } from '@nestjs/common';

import { AuditCommandService } from '../audit/audit-command.service';
import { DatabaseService } from '../database/database.service';
import { formatDateOnly, instantToBusinessDateMinute } from '../shift/business-date';
import { exportStorageRoot, localExportStorageKey, localExportStoragePath } from './export-storage';
import { buildScheduleWorkbook, type ScheduleExportRow } from './schedule-workbook';

const EXCEL_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const DOWNLOAD_LIFETIME_MS = 24 * 60 * 60_000;

interface ClaimedJob {
  readonly id: string;
}

export interface ExportProcessingResult {
  readonly exportJobId: string | null;
  readonly processed: boolean;
  readonly status: 'FAILED' | 'SUCCEEDED' | null;
}

@Injectable()
export class ExportProcessorService {
  private readonly logger = new Logger(ExportProcessorService.name);

  constructor(
    private readonly audit: AuditCommandService,
    private readonly database: DatabaseService,
  ) {}

  async runOne(now = new Date()): Promise<ExportProcessingResult> {
    const jobId = await this.claim(now);
    if (!jobId) return { exportJobId: null, processed: false, status: null };

    let finalPath: string | null = null;
    let temporaryPath: string | null = null;
    try {
      const job = await this.database.read((client) =>
        client.exportJob.findUnique({
          select: {
            id: true,
            rowVersion: true,
            scheduleDate: true,
            scope: true,
            siteId: true,
            status: true,
          },
          where: { id: jobId },
        }),
      );
      if (!job || job.status !== 'PROCESSING') throw new Error('Export job was not claimable');

      const rows = await this.rows(job.scheduleDate, job.scope, job.siteId);
      const buffer = await buildScheduleWorkbook(rows);
      const storageRoot = exportStorageRoot();
      await mkdir(storageRoot, { recursive: true });
      const storageKey = localExportStorageKey(job.id);
      finalPath = localExportStoragePath(job.id, storageKey);
      temporaryPath = `${finalPath}.${randomUUID()}.tmp`;
      await writeFile(temporaryPath, buffer, { flag: 'wx' });
      await rename(temporaryPath, finalPath);
      temporaryPath = null;

      const completedAt = new Date();
      const filename = `${formatDateOnly(job.scheduleDate)}_${job.scope === 'ALL_SITES' ? '全部场地' : '单场地'}_排班.xlsx`;
      await this.database.transaction(async (transaction) => {
        const updated = await transaction.exportJob.updateMany({
          data: {
            completedAt,
            contentType: EXCEL_CONTENT_TYPE,
            expiresAt: new Date(completedAt.getTime() + DOWNLOAD_LIFETIME_MS),
            fileSha256: createHash('sha256').update(buffer).digest('hex'),
            fileSizeBytes: BigInt(buffer.byteLength),
            outputFilename: filename,
            rowCount: rows.length,
            rowVersion: { increment: 1 },
            status: 'SUCCEEDED',
            storageKey,
          },
          where: { id: job.id, rowVersion: job.rowVersion, status: 'PROCESSING' },
        });
        if (updated.count !== 1) throw new Error('Export job completion conflicted');
        await this.audit.append(
          transaction,
          { actorName: '排班导出任务', roleCode: 'SYSTEM' },
          {
            action: 'SCHEDULE_EXPORT_SUCCEEDED',
            afterData: { rowCount: rows.length, status: 'SUCCEEDED' },
            objectId: job.id,
            objectType: 'EXPORT_JOB',
            ...(job.siteId ? { siteId: job.siteId } : {}),
          },
        );
      });
      return { exportJobId: job.id, processed: true, status: 'SUCCEEDED' };
    } catch (error) {
      if (temporaryPath) await rm(temporaryPath, { force: true }).catch(() => undefined);
      if (finalPath) await rm(finalPath, { force: true }).catch(() => undefined);
      await this.fail(jobId, new Date());
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.error(`排班导出 ${jobId} 失败：${message}`);
      return { exportJobId: jobId, processed: true, status: 'FAILED' };
    }
  }

  private claim(now: Date): Promise<string | null> {
    return this.database.transaction(async (transaction) => {
      const jobs = await transaction.$queryRaw<ClaimedJob[]>(Prisma.sql`
        SELECT "id"
        FROM "export_jobs"
        WHERE "status" = 'PENDING'
        ORDER BY "created_at", "id"
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      `);
      const job = jobs[0];
      if (!job) return null;
      const updated = await transaction.exportJob.updateMany({
        data: { rowVersion: { increment: 1 }, startedAt: now, status: 'PROCESSING' },
        where: { id: job.id, rowVersion: 1, status: 'PENDING' },
      });
      return updated.count === 1 ? job.id : null;
    });
  }

  private async rows(
    scheduleDate: Date,
    scope: string,
    siteId: string | null,
  ): Promise<readonly ScheduleExportRow[]> {
    let siteWhere: Prisma.SiteWhereInput;
    if (scope === 'ALL_SITES') {
      siteWhere = { status: 'ACTIVE' };
    } else {
      if (!siteId) throw new Error('Single-site export has no site');
      siteWhere = { id: siteId, status: 'ACTIVE' };
    }
    return this.database.read(async (client) => {
      const sites = await client.site.findMany({
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }, { id: 'asc' }],
        select: { id: true },
        where: siteWhere,
      });
      const siteOrder = new Map(sites.map((site, index) => [site.id, index]));
      const appointments = await client.appointment.findMany({
        select: {
          appointmentType: true,
          artistNicknameSnapshot: true,
          durationMinutes: true,
          endAt: true,
          hostCodeSnapshot: true,
          hostNameSnapshot: true,
          id: true,
          operatorNameSnapshot: true,
          siteId: true,
          siteNameSnapshot: true,
          startAt: true,
          status: true,
        },
        where: {
          appointmentDate: scheduleDate,
          siteId: { in: sites.map((site) => site.id) },
          status: { in: ['BOOKED', 'COMPLETED'] },
        },
      });
      appointments.sort(
        (left, right) =>
          (siteOrder.get(left.siteId) ?? 0) - (siteOrder.get(right.siteId) ?? 0) ||
          left.artistNicknameSnapshot.localeCompare(right.artistNicknameSnapshot, 'zh-CN') ||
          left.startAt.getTime() - right.startAt.getTime() ||
          left.id.localeCompare(right.id),
      );
      return appointments.map((appointment) => ({
        appointmentType: appointment.appointmentType as ScheduleExportRow['appointmentType'],
        artistNickname: appointment.artistNicknameSnapshot,
        durationMinutes: appointment.durationMinutes,
        endMinute: instantToBusinessDateMinute(scheduleDate, appointment.endAt),
        hostCode: appointment.hostCodeSnapshot,
        hostName: appointment.hostNameSnapshot,
        operatorName: appointment.operatorNameSnapshot,
        scheduleDate: formatDateOnly(scheduleDate),
        siteName: appointment.siteNameSnapshot,
        startMinute: instantToBusinessDateMinute(scheduleDate, appointment.startAt),
        status: appointment.status as ScheduleExportRow['status'],
      }));
    });
  }

  private async fail(jobId: string, completedAt: Date): Promise<void> {
    await this.database.transaction(async (transaction) => {
      const updated = await transaction.exportJob.updateMany({
        data: {
          completedAt,
          failureReason: '排班文件生成失败，请稍后重试',
          rowVersion: { increment: 1 },
          status: 'FAILED',
        },
        where: { id: jobId, status: 'PROCESSING' },
      });
      if (updated.count !== 1) return;
      await this.audit.append(
        transaction,
        { actorName: '排班导出任务', roleCode: 'SYSTEM' },
        {
          action: 'SCHEDULE_EXPORT_FAILED',
          afterData: { status: 'FAILED' },
          objectId: jobId,
          objectType: 'EXPORT_JOB',
        },
      );
    });
  }
}
