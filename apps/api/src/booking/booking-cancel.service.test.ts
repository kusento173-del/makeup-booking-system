import type { Prisma } from '@makeup/database';
import { describe, expect, it, vi } from 'vitest';

import type { AuditCommandService } from '../audit/audit-command.service';
import {
  AuthorizationDeniedError,
  AuthorizationPolicyService,
} from '../auth/authorization-policy.service';
import type { DatabaseService } from '../database/database.service';
import { BookingCancelService } from './booking-cancel.service';
import {
  BookingCancellationCutoffError,
  BookingCancellationReasonInvalidError,
  BookingStateConflictError,
} from './booking-create.errors';
import type { BookingCommandContext } from './booking-create.types';

const now = new Date('2026-07-22T04:00:00.000Z');
const appointment = {
  appointmentDate: new Date('2026-07-23T00:00:00.000Z'),
  artistId: 'artist-1',
  host: { userId: 'host-user-1' },
  hostId: 'host-1',
  id: 'appointment-1',
  rowVersion: 1,
  siteId: 'site-1',
  status: 'BOOKED',
};
const context: BookingCommandContext = {
  actorName: '小雨',
  roleAssignmentId: 'role-1',
  roleCode: 'HOST',
  siteId: 'site-1',
  userId: 'host-user-1',
};
const command = { appointmentId: 'appointment-1', expectedRowVersion: 1 };

function createService(options?: {
  appointment?: object | null;
  relation?: object | null;
  updateCount?: number;
}) {
  const transaction = {
    appointment: {
      findUnique: vi
        .fn()
        .mockResolvedValue(options?.appointment === undefined ? appointment : options.appointment),
      updateMany: vi.fn().mockResolvedValue({ count: options?.updateCount ?? 1 }),
    },
    hostOperatorRelation: {
      findFirst: vi
        .fn()
        .mockResolvedValue(
          options?.relation === undefined ? { id: 'relation-1' } : options.relation,
        ),
    },
    outboxEvent: { create: vi.fn().mockResolvedValue({ id: 'event-1' }) },
  };
  const audit = { append: vi.fn().mockResolvedValue('audit-1') };
  const database = {
    transaction: vi.fn((operation: (client: Prisma.TransactionClient) => unknown) =>
      operation(transaction as unknown as Prisma.TransactionClient),
    ),
  };
  return {
    audit,
    database,
    service: new BookingCancelService(
      audit as unknown as AuditCommandService,
      new AuthorizationPolicyService(),
      database as unknown as DatabaseService,
    ),
    transaction,
  };
}

describe('BookingCancelService', () => {
  it('cancels a future own booking and records audit plus notification outbox atomically', async () => {
    const { audit, service, transaction } = createService();

    await expect(service.cancel(context, command, now)).resolves.toEqual({
      cancelledAt: now.toISOString(),
      id: 'appointment-1',
      rowVersion: 2,
      status: 'CANCELLED',
    });
    expect(transaction.appointment.updateMany.mock.calls[0]?.[0]).toMatchObject({
      data: {
        cancellationReasonCode: 'USER_CANCELLED',
        cancelledByUserId: 'host-user-1',
        rowVersion: { increment: 1 },
        status: 'CANCELLED',
      },
      where: { id: 'appointment-1', rowVersion: 1, status: 'BOOKED' },
    });
    expect(audit.append).toHaveBeenCalledWith(
      transaction,
      context,
      expect.objectContaining({ action: 'APPOINTMENT_CANCELLED' }),
    );
    expect(transaction.outboxEvent.create.mock.calls[0]?.[0]).toMatchObject({
      data: { eventType: 'APPOINTMENT_CANCELLED' },
    });
  });

  it('blocks hosts and operators from the appointment date onward', async () => {
    const sameDay = new Date('2026-07-23T00:00:00.000Z');
    await expect(createService().service.cancel(context, command, sameDay)).rejects.toBeInstanceOf(
      BookingCancellationCutoffError,
    );
    await expect(
      createService().service.cancel(
        { ...context, roleCode: 'OPERATOR', userId: 'operator-user-1' },
        command,
        sameDay,
      ),
    ).rejects.toBeInstanceOf(BookingCancellationCutoffError);
  });

  it('allows customer service and admin to handle same-day exceptions only with a reason', async () => {
    const customerService = {
      ...context,
      roleCode: 'CUSTOMER_SERVICE' as const,
      userId: 'customer-service-1',
    };
    const missing = createService();
    expect(() => missing.service.cancel(customerService, command, now)).toThrow(
      BookingCancellationReasonInvalidError,
    );
    expect(missing.database.transaction).not.toHaveBeenCalled();

    const allowed = createService();
    await allowed.service.cancel(
      customerService,
      { ...command, reason: ' 主播突发情况 ' },
      new Date('2026-07-23T04:00:00.000Z'),
    );
    expect(allowed.transaction.appointment.updateMany.mock.calls[0]?.[0]).toMatchObject({
      data: {
        cancellationReasonCode: 'BACKOFFICE_CANCELLED',
        cancellationReasonText: '主播突发情况',
      },
    });
  });

  it('authorizes operators from the relation effective on the appointment date', async () => {
    const operator = { ...context, roleCode: 'OPERATOR' as const, userId: 'operator-user-1' };
    const allowed = createService();
    await allowed.service.cancel(operator, command, now);
    expect(allowed.transaction.hostOperatorRelation.findFirst.mock.calls[0]?.[0]).toMatchObject({
      where: { hostId: 'host-1' },
    });

    await expect(
      createService({ relation: null }).service.cancel(operator, command, now),
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
  });

  it('rejects stale, completed and concurrently changed appointments before side effects', async () => {
    for (const options of [
      { appointment: { ...appointment, rowVersion: 2 } },
      { appointment: { ...appointment, status: 'COMPLETED' } },
      { updateCount: 0 },
    ]) {
      const { audit, service, transaction } = createService(options);
      await expect(service.cancel(context, command, now)).rejects.toBeInstanceOf(
        BookingStateConflictError,
      );
      expect(transaction.outboxEvent.create).not.toHaveBeenCalled();
      expect(audit.append).not.toHaveBeenCalled();
    }
  });
});
