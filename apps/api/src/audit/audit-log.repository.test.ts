import type { Prisma } from '@makeup/database';
import { describe, expect, it, vi } from 'vitest';

import { AuditLogRepository } from './audit-log.repository';
import type { AuditEntryDraft } from './audit.types';

describe('AuditLogRepository', () => {
  it('appends through the caller transaction and returns the log ID', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'log-1' });
    const transaction = { operationLog: { create } } as unknown as Prisma.TransactionClient;
    const entry: AuditEntryDraft = {
      action: 'HOST_UPDATED',
      actorNameSnapshot: '管理员',
      actorRole: 'ADMIN',
      actorUserId: 'user-1',
      afterData: { displayName: '新姓名' },
      beforeData: { displayName: '旧姓名' },
      clientType: 'ADMIN_WEB',
      ipAddress: null,
      objectId: 'host-1',
      objectType: 'HOST',
      reason: null,
      requestId: 'request-1',
      siteId: 'site-1',
      userAgent: null,
    };

    await expect(new AuditLogRepository().append(transaction, entry)).resolves.toBe('log-1');
    expect(create).toHaveBeenCalledWith({
      data: {
        action: 'HOST_UPDATED',
        actorNameSnapshot: '管理员',
        actorRole: 'ADMIN',
        actorUserId: 'user-1',
        afterData: { displayName: '新姓名' },
        beforeData: { displayName: '旧姓名' },
        clientType: 'ADMIN_WEB',
        ipAddress: null,
        objectId: 'host-1',
        objectType: 'HOST',
        reason: null,
        requestId: 'request-1',
        siteId: 'site-1',
        userAgent: null,
      },
      select: { id: true },
    });
  });
});
