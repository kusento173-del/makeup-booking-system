import { createHash } from 'node:crypto';

import { Prisma } from '@makeup/database';
import { Injectable } from '@nestjs/common';

import { AuditCommandService } from '../audit/audit-command.service';
import {
  AuthorizationDeniedError,
  AuthorizationPolicyService,
} from '../auth/authorization-policy.service';
import type { VerifiedAuthorizationContext } from '../auth/authorization.types';
import { DatabaseService } from '../database/database.service';
import { acquireTransactionLock } from '../database/transaction-lock';
import { formatDateOnly, toBusinessDate } from '../shift/business-date';
import {
  ExportDateOutOfRangeError,
  ExportIdempotencyConflictError,
  ExportIdempotencyKeyInvalidError,
  ExportSiteUnavailableError,
  ExportStateConflictError,
} from './export.errors';
import type {
  CreateExportCommand,
  ExportCommandContext,
  ExportListInput,
  ExportPage,
  ExportStatus,
  ExportSummary,
} from './export.types';

const IDEMPOTENCY_SCOPE = 'SCHEDULE_EXPORT_CREATE';
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;

const EXPORT_SELECT = {
  completedAt: true,
  createdAt: true,
  expiresAt: true,
  failureReason: true,
  id: true,
  outputFilename: true,
  rowCount: true,
  rowVersion: true,
  scheduleDate: true,
  scope: true,
  site: { select: { name: true } },
  siteId: true,
  status: true,
} satisfies Prisma.ExportJobSelect;

type ExportRecord = Prisma.ExportJobGetPayload<{ select: typeof EXPORT_SELECT }>;

@Injectable()
export class ExportService {
  constructor(
    private readonly audit: AuditCommandService,
    private readonly authorization: AuthorizationPolicyService,
    private readonly database: DatabaseService,
  ) {}

  create(
    context: ExportCommandContext,
    command: CreateExportCommand,
    now = new Date(),
  ): Promise<ExportSummary> {
    this.authorization.assertRole(context, ['CUSTOMER_SERVICE', 'ADMIN']);
    this.validateDate(command.scheduleDate, now);
    const idempotencyKey = this.normalizeIdempotencyKey(command.idempotencyKey);
    const requestHash = this.requestHash(command);

    return this.database.transaction(async (transaction) => {
      await acquireTransactionLock(
        transaction,
        `idempotency:${context.userId}:${IDEMPOTENCY_SCOPE}:${idempotencyKey}`,
      );
      const replay = await this.prepareIdempotency(
        transaction,
        context.userId,
        idempotencyKey,
        requestHash,
        now,
      );
      if (replay) return replay;

      const siteId = await this.resolveScope(transaction, context, command);
      const job = await transaction.exportJob.create({
        data: {
          requestedByRoleCode: context.roleCode,
          requestedByUserId: context.userId,
          scheduleDate: command.scheduleDate,
          scope: command.scope,
          siteId,
        },
        select: EXPORT_SELECT,
      });
      const summary = this.toSummary(job, now);
      await this.audit.append(transaction, context, {
        action: 'SCHEDULE_EXPORT_REQUESTED',
        afterData: {
          scheduleDate: summary.scheduleDate,
          scope: summary.scope,
          siteId: summary.siteId,
          status: summary.status,
        },
        objectId: job.id,
        objectType: 'EXPORT_JOB',
        ...(siteId ? { siteId } : {}),
      });
      await transaction.outboxEvent.create({
        data: {
          aggregateId: job.id,
          aggregateType: 'EXPORT_JOB',
          eventType: 'SCHEDULE_EXPORT_REQUESTED',
          payload: {
            exportJobId: job.id,
            scheduleDate: summary.scheduleDate,
            scope: summary.scope,
            siteId: summary.siteId,
          },
        },
      });
      await this.completeIdempotency(transaction, context.userId, idempotencyKey, job.id);
      return summary;
    });
  }

  list(
    context: VerifiedAuthorizationContext,
    input: ExportListInput,
    now = new Date(),
  ): Promise<ExportPage> {
    this.authorization.assertRole(context, ['CUSTOMER_SERVICE', 'ADMIN']);
    const where = this.listScope(context, input.status);
    return this.database.read(async (client) => {
      const [items, total] = await Promise.all([
        client.exportJob.findMany({
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          select: EXPORT_SELECT,
          skip: (input.page - 1) * input.pageSize,
          take: input.pageSize,
          where,
        }),
        client.exportJob.count({ where }),
      ]);
      return {
        items: items.map((item) => this.toSummary(item, now)),
        page: input.page,
        pageSize: input.pageSize,
        total,
      };
    });
  }

  private async resolveScope(
    transaction: Prisma.TransactionClient,
    context: ExportCommandContext,
    command: CreateExportCommand,
  ): Promise<string | null> {
    let siteId: string | undefined;
    if (context.roleCode === 'CUSTOMER_SERVICE') {
      if (command.scope !== 'SINGLE_SITE' || command.siteId || !context.siteId) {
        throw new AuthorizationDeniedError();
      }
      siteId = context.siteId;
    } else if (command.scope === 'SINGLE_SITE') {
      if (!command.siteId) throw new ExportSiteUnavailableError();
      siteId = command.siteId;
    } else if (command.siteId) {
      throw new ExportSiteUnavailableError();
    }

    if (siteId) {
      const site = await transaction.site.findFirst({
        select: { id: true },
        where: { id: siteId, status: 'ACTIVE' },
      });
      if (!site) throw new ExportSiteUnavailableError();
      return site.id;
    }

    const activeSiteCount = await transaction.site.count({ where: { status: 'ACTIVE' } });
    if (activeSiteCount === 0) throw new ExportSiteUnavailableError();
    return null;
  }

  private listScope(
    context: VerifiedAuthorizationContext,
    status: ExportStatus | undefined,
  ): Prisma.ExportJobWhereInput {
    const statusFilter = status ? { status } : {};
    if (context.roleCode === 'ADMIN') return statusFilter;
    if (context.roleCode === 'CUSTOMER_SERVICE' && context.siteId) {
      return { ...statusFilter, siteId: context.siteId };
    }
    throw new AuthorizationDeniedError();
  }

  private validateDate(scheduleDate: Date, now: Date): void {
    const today = toBusinessDate(now);
    const lastDate = new Date(today);
    lastDate.setUTCDate(lastDate.getUTCDate() + 7);
    if (
      Number.isNaN(scheduleDate.getTime()) ||
      scheduleDate.getUTCHours() !== 0 ||
      scheduleDate.getUTCMinutes() !== 0 ||
      scheduleDate.getUTCSeconds() !== 0 ||
      scheduleDate.getUTCMilliseconds() !== 0 ||
      scheduleDate > lastDate
    ) {
      throw new ExportDateOutOfRangeError();
    }
  }

  private normalizeIdempotencyKey(value: string): string {
    const normalized = value.normalize('NFKC').trim();
    if (!IDEMPOTENCY_KEY_PATTERN.test(normalized)) {
      throw new ExportIdempotencyKeyInvalidError();
    }
    return normalized;
  }

  private requestHash(command: CreateExportCommand): string {
    return createHash('sha256')
      .update(
        JSON.stringify({
          scheduleDate: formatDateOnly(command.scheduleDate),
          scope: command.scope,
          siteId: command.siteId ?? null,
        }),
      )
      .digest('hex');
  }

  private async prepareIdempotency(
    transaction: Prisma.TransactionClient,
    userId: string,
    idempotencyKey: string,
    requestHash: string,
    now: Date,
  ): Promise<ExportSummary | null> {
    const where = {
      userId_scope_idempotencyKey: { idempotencyKey, scope: IDEMPOTENCY_SCOPE, userId },
    };
    const existing = await transaction.idempotencyRecord.findUnique({ where });
    if (existing && existing.expiresAt <= now) {
      await transaction.idempotencyRecord.delete({ where });
    } else if (existing) {
      if (existing.requestHash !== requestHash) throw new ExportIdempotencyConflictError();
      if (existing.resourceType !== 'EXPORT_JOB' || !existing.resourceId) {
        throw new ExportStateConflictError();
      }
      const job = await transaction.exportJob.findUnique({
        select: EXPORT_SELECT,
        where: { id: existing.resourceId },
      });
      if (!job) throw new ExportStateConflictError();
      return this.toSummary(job, now);
    }
    await transaction.idempotencyRecord.create({
      data: {
        expiresAt: new Date(now.getTime() + 24 * 60 * 60_000),
        idempotencyKey,
        requestHash,
        scope: IDEMPOTENCY_SCOPE,
        userId,
      },
    });
    return null;
  }

  private async completeIdempotency(
    transaction: Prisma.TransactionClient,
    userId: string,
    idempotencyKey: string,
    exportJobId: string,
  ): Promise<void> {
    const updated = await transaction.idempotencyRecord.updateMany({
      data: {
        resourceId: exportJobId,
        resourceType: 'EXPORT_JOB',
        responseBody: { exportJobId },
        responseStatus: 201,
      },
      where: {
        idempotencyKey,
        resourceId: null,
        scope: IDEMPOTENCY_SCOPE,
        userId,
      },
    });
    if (updated.count !== 1) throw new ExportStateConflictError();
  }

  private toSummary(job: ExportRecord, now: Date): ExportSummary {
    return {
      completedAt: job.completedAt?.toISOString() ?? null,
      createdAt: job.createdAt.toISOString(),
      downloadable: job.status === 'SUCCEEDED' && Boolean(job.expiresAt && job.expiresAt > now),
      expiresAt: job.expiresAt?.toISOString() ?? null,
      failureReason: job.failureReason,
      id: job.id,
      outputFilename: job.outputFilename,
      rowCount: job.rowCount,
      rowVersion: job.rowVersion,
      scheduleDate: formatDateOnly(job.scheduleDate),
      scope: job.scope as ExportSummary['scope'],
      siteId: job.siteId,
      siteName: job.site?.name ?? null,
      status: job.status as ExportSummary['status'],
    };
  }
}
