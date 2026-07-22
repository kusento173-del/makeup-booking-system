import { createHash } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import {
  AuthorizationDeniedError,
  AuthorizationPolicyService,
} from '../auth/authorization-policy.service';
import { ExportDateOutOfRangeError, ExportIdempotencyConflictError } from './export.errors';
import { ExportService } from './export.service';

const now = new Date('2026-07-22T12:00:00.000Z');
const pendingJob = {
  completedAt: null,
  createdAt: now,
  expiresAt: null,
  failureReason: null,
  id: '019b0000-0000-7000-8000-000000000010',
  outputFilename: null,
  rowCount: null,
  rowVersion: 1,
  scheduleDate: new Date('2026-07-23T00:00:00.000Z'),
  scope: 'SINGLE_SITE',
  site: { name: '松江场地' },
  siteId: '019b0000-0000-7000-8000-000000000001',
  status: 'PENDING',
};

const customerServiceContext = {
  actorName: '松江客服',
  roleAssignmentId: 'role-1',
  roleCode: 'CUSTOMER_SERVICE' as const,
  siteId: pendingJob.siteId,
  userId: '019b0000-0000-7000-8000-000000000002',
};

function setup(existingIdempotency: unknown = null) {
  const transaction = {
    $queryRaw: vi.fn().mockResolvedValue([{ acquired: 1 }]),
    exportJob: {
      create: vi.fn().mockResolvedValue(pendingJob),
      findUnique: vi.fn().mockResolvedValue(pendingJob),
    },
    idempotencyRecord: {
      create: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
      findUnique: vi.fn().mockResolvedValue(existingIdempotency),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    outboxEvent: { create: vi.fn().mockResolvedValue({}) },
    site: {
      count: vi.fn().mockResolvedValue(2),
      findFirst: vi.fn().mockResolvedValue({ id: pendingJob.siteId }),
    },
  };
  const audit = { append: vi.fn().mockResolvedValue('audit-1') };
  const database = {
    read: vi.fn(),
    transaction: vi.fn((callback: (client: typeof transaction) => unknown) =>
      callback(transaction),
    ),
  };
  return {
    audit,
    database,
    service: new ExportService(audit as never, new AuthorizationPolicyService(), database as never),
    transaction,
  };
}

describe('ExportService', () => {
  it('creates a customer-service export fixed to the role site with one outbox event', async () => {
    const { audit, service, transaction } = setup();

    const result = await service.create(
      customerServiceContext,
      {
        idempotencyKey: 'export-key-0001',
        scheduleDate: new Date('2026-07-23T00:00:00.000Z'),
        scope: 'SINGLE_SITE',
      },
      now,
    );

    expect(result).toMatchObject({
      id: pendingJob.id,
      siteId: pendingJob.siteId,
      status: 'PENDING',
    });
    expect(transaction.exportJob.create).toHaveBeenCalledOnce();
    const createInput = transaction.exportJob.create.mock.calls[0]?.[0] as
      { data: { requestedByRoleCode: string; siteId: string | null } } | undefined;
    expect(createInput?.data).toMatchObject({
      requestedByRoleCode: 'CUSTOMER_SERVICE',
      siteId: pendingJob.siteId,
    });
    expect(transaction.outboxEvent.create).toHaveBeenCalledOnce();
    expect(audit.append).toHaveBeenCalledOnce();
  });

  it('rejects customer-service all-site or caller-supplied site scopes', async () => {
    const { service } = setup();
    await expect(
      service.create(
        customerServiceContext,
        {
          idempotencyKey: 'export-key-0001',
          scheduleDate: new Date('2026-07-23T00:00:00.000Z'),
          scope: 'ALL_SITES',
        },
        now,
      ),
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
  });

  it('replays the original job without duplicate audit or event writes', async () => {
    const requestHash = createHash('sha256')
      .update(
        JSON.stringify({
          scheduleDate: '2026-07-23',
          scope: 'SINGLE_SITE',
          siteId: null,
        }),
      )
      .digest('hex');
    const existing = {
      expiresAt: new Date('2026-07-23T12:00:00.000Z'),
      requestHash,
      resourceId: pendingJob.id,
      resourceType: 'EXPORT_JOB',
    };
    const { audit, service, transaction } = setup(existing);

    const result = await service.create(
      customerServiceContext,
      {
        idempotencyKey: 'export-key-0001',
        scheduleDate: new Date('2026-07-23T00:00:00.000Z'),
        scope: 'SINGLE_SITE',
      },
      now,
    );

    expect(result.id).toBe(pendingJob.id);
    expect(transaction.exportJob.create).not.toHaveBeenCalled();
    expect(transaction.outboxEvent.create).not.toHaveBeenCalled();
    expect(audit.append).not.toHaveBeenCalled();
  });

  it('rejects reuse of an idempotency key for a different request', async () => {
    const { service } = setup({
      expiresAt: new Date('2026-07-23T12:00:00.000Z'),
      requestHash: 'f'.repeat(64),
      resourceId: pendingJob.id,
      resourceType: 'EXPORT_JOB',
    });
    await expect(
      service.create(
        customerServiceContext,
        {
          idempotencyKey: 'export-key-0001',
          scheduleDate: new Date('2026-07-23T00:00:00.000Z'),
          scope: 'SINGLE_SITE',
        },
        now,
      ),
    ).rejects.toBeInstanceOf(ExportIdempotencyConflictError);
  });

  it('scopes customer-service lists to its site', async () => {
    const { database, service } = setup();
    const client = {
      exportJob: {
        count: vi.fn().mockResolvedValue(1),
        findMany: vi.fn().mockResolvedValue([pendingJob]),
      },
    };
    database.read.mockImplementation((callback: (value: typeof client) => unknown) =>
      callback(client),
    );

    const result = await service.list(
      customerServiceContext,
      { page: 1, pageSize: 50, status: 'PENDING' },
      now,
    );

    expect(result.total).toBe(1);
    expect(client.exportJob.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { siteId: pendingJob.siteId, status: 'PENDING' } }),
    );
  });

  it('rejects dates beyond the seven-day booking horizon', () => {
    const { service } = setup();
    expect(() =>
      service.create(
        customerServiceContext,
        {
          idempotencyKey: 'export-key-0001',
          scheduleDate: new Date('2026-07-30T00:00:00.000Z'),
          scope: 'SINGLE_SITE',
        },
        now,
      ),
    ).toThrow(ExportDateOutOfRangeError);
  });
});
