import { describe, expect, it, vi } from 'vitest';

import { ExportController } from './export.controller';

const authorization = {
  expiresAt: new Date('2026-07-22T13:00:00.000Z'),
  roleAssignmentId: 'role-1',
  roleCode: 'ADMIN' as const,
  sessionId: 'session-1',
  siteId: null,
  userId: 'user-1',
};

describe('ExportController', () => {
  it('resolves an audited command context before creating a job', async () => {
    const context = { ...authorization, actorName: '管理员' };
    const contexts = { resolve: vi.fn().mockResolvedValue(context) };
    const exports = { create: vi.fn().mockResolvedValue({ id: 'job-1' }), list: vi.fn() };
    const controller = new ExportController(contexts as never, exports as never);

    await controller.create(
      { scheduleDate: '2026-07-23', scope: 'ALL_SITES' },
      'export-key-0001',
      authorization,
      '127.0.0.1',
      'test-agent',
      'request-1',
    );

    expect(contexts.resolve).toHaveBeenCalledWith(
      authorization,
      expect.objectContaining({ clientType: 'ADMIN_WEB', requestId: 'request-1' }),
    );
    expect(exports.create).toHaveBeenCalledWith(
      context,
      expect.objectContaining({
        idempotencyKey: 'export-key-0001',
        scope: 'ALL_SITES',
      }),
    );
  });

  it('parses list filters before delegation', async () => {
    const exports = { create: vi.fn(), list: vi.fn().mockResolvedValue({ items: [], total: 0 }) };
    const controller = new ExportController({ resolve: vi.fn() } as never, exports as never);

    await controller.list({ page: '2', status: 'FAILED' }, authorization);

    expect(exports.list).toHaveBeenCalledWith(authorization, {
      page: 2,
      pageSize: 50,
      status: 'FAILED',
    });
  });
});
