import type { Prisma } from '@makeup/database';
import { describe, expect, it, vi } from 'vitest';

import type { AuditCommandService } from '../audit/audit-command.service';
import { AuthorizationPolicyService } from '../auth/authorization-policy.service';
import type { DatabaseService } from '../database/database.service';
import { FixedRequestStateConflictError } from './fixed-request.errors';
import { FixedRequestWithdrawService } from './fixed-request-withdraw.service';

const context = {
  actorName: '运营小周',
  roleAssignmentId: 'role-1',
  roleCode: 'OPERATOR' as const,
  siteId: 'site-1',
  userId: 'operator-user-1',
};
const request = {
  hostId: 'host-1',
  id: 'request-1',
  rowVersion: 1,
  siteId: 'site-1',
  status: 'PENDING',
  submittedByUserId: 'operator-user-1',
};

function createService(requestValue: object | null = request) {
  const transaction = {
    $queryRaw: vi.fn().mockResolvedValue([{ acquired: 1 }]),
    fixedAppointmentRequest: {
      findUnique: vi.fn().mockResolvedValue(requestValue),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const database = {
    transaction: vi.fn((operation: (value: Prisma.TransactionClient) => unknown) =>
      operation(transaction as unknown as Prisma.TransactionClient),
    ),
  };
  const audit = { append: vi.fn().mockResolvedValue('audit-1') };
  return {
    audit,
    service: new FixedRequestWithdrawService(
      audit as unknown as AuditCommandService,
      new AuthorizationPolicyService(),
      database as unknown as DatabaseService,
    ),
    transaction,
  };
}

describe('FixedRequestWithdrawService', () => {
  it('lets only the original operator atomically withdraw a pending request', async () => {
    const { audit, service, transaction } = createService();

    await expect(
      service.withdraw(context, { expectedRowVersion: 1, requestId: 'request-1' }),
    ).resolves.toEqual({ id: 'request-1', rowVersion: 2, status: 'WITHDRAWN' });

    expect(transaction.fixedAppointmentRequest.updateMany).toHaveBeenCalledWith({
      data: { rowVersion: { increment: 1 }, status: 'WITHDRAWN' },
      where: {
        id: 'request-1',
        rowVersion: 1,
        status: 'PENDING',
        submittedByUserId: 'operator-user-1',
      },
    });
    expect(audit.append).toHaveBeenCalledOnce();
  });

  it('rejects a different submitter or stale row version without releasing the hold', async () => {
    const other = createService({ ...request, submittedByUserId: 'other-user' });
    await expect(
      other.service.withdraw(context, { expectedRowVersion: 1, requestId: 'request-1' }),
    ).rejects.toBeInstanceOf(FixedRequestStateConflictError);
    expect(other.transaction.fixedAppointmentRequest.updateMany).not.toHaveBeenCalled();

    const stale = createService();
    await expect(
      stale.service.withdraw(context, { expectedRowVersion: 2, requestId: 'request-1' }),
    ).rejects.toBeInstanceOf(FixedRequestStateConflictError);
  });
});
