import type { Prisma } from '@makeup/database';
import { describe, expect, it, vi } from 'vitest';

import type { AuditCommandService } from '../audit/audit-command.service';
import { AuthorizationPolicyService } from '../auth/authorization-policy.service';
import type { DatabaseService } from '../database/database.service';
import {
  BookingCancellationCutoffError,
  BookingCancellationReasonInvalidError,
  BookingSlotConflictError,
  BookingStateConflictError,
} from './booking-create.errors';
import type { BookingCreateService, BookingCreationOptions } from './booking-create.service';
import type { AppointmentSummary, BookingCommandContext } from './booking-create.types';
import { BookingRescheduleService } from './booking-reschedule.service';

const now = new Date('2026-07-22T04:00:00.000Z');
const original = {
  appointmentDate: new Date('2026-07-23T00:00:00.000Z'),
  artistId: 'artist-1',
  cancelledAt: null,
  host: { userId: 'host-user-1' },
  hostId: 'host-1',
  id: 'appointment-1',
  rowVersion: 1,
  siteId: 'site-1',
  status: 'BOOKED',
};
const replacement: AppointmentSummary = {
  appointmentType: 'SINGLE',
  artistId: 'artist-2',
  artistNickname: '江江',
  dailySequence: 1,
  date: '2026-07-24',
  durationMinutes: 45,
  endAt: '2026-07-24T02:15:00.000Z',
  hostCode: 'ZB01001',
  hostId: 'host-1',
  hostName: '小雨',
  id: 'replacement-1',
  operatorId: 'operator-1',
  operatorName: '运营甲',
  rowVersion: 1,
  siteId: 'site-1',
  siteName: '松江场地',
  startAt: '2026-07-24T01:30:00.000Z',
  status: 'BOOKED',
};
const context: BookingCommandContext = {
  actorName: '小雨',
  roleAssignmentId: 'role-1',
  roleCode: 'HOST',
  siteId: 'site-1',
  userId: 'host-user-1',
};
const command = {
  appointmentId: 'appointment-1',
  artistId: 'artist-2',
  confirmedSecondBooking: false,
  date: new Date('2026-07-24T00:00:00.000Z'),
  durationMinutes: 45,
  expectedRowVersion: 1,
  idempotencyKey: 'reschedule-key-0001',
  startMinute: 570,
};

function createService(options?: {
  createError?: Error;
  original?: object | null;
  replay?: AppointmentSummary | null;
  updateCount?: number;
}) {
  const transaction = {
    $queryRaw: vi.fn().mockResolvedValue([{ acquired: 1 }]),
    appointment: {
      findUnique: vi
        .fn()
        .mockResolvedValue(options?.original === undefined ? original : options.original),
      updateMany: vi.fn().mockResolvedValue({ count: options?.updateCount ?? 1 }),
    },
    hostOperatorRelation: { findFirst: vi.fn().mockResolvedValue({ id: 'relation-1' }) },
    outboxEvent: { create: vi.fn().mockResolvedValue({ id: 'event-1' }) },
  };
  const createFresh = vi
    .fn()
    .mockImplementation(
      (
        _transaction: Prisma.TransactionClient,
        _context: BookingCommandContext,
        _command: unknown,
        creation: BookingCreationOptions,
      ) => {
        if (options?.createError) return Promise.reject(options.createError);
        return Promise.resolve({ ...replacement, id: creation.appointmentId ?? replacement.id });
      },
    );
  const creator = {
    completeIdempotency: vi.fn().mockResolvedValue(undefined),
    createFresh,
    normalizeIdempotencyKey: vi.fn((value: string) => value),
    prepareIdempotency: vi.fn().mockResolvedValue(options?.replay ?? null),
  };
  const audit = { append: vi.fn().mockResolvedValue('audit-1') };
  const database = {
    transaction: vi.fn((operation: (client: Prisma.TransactionClient) => unknown) =>
      operation(transaction as unknown as Prisma.TransactionClient),
    ),
  };
  return {
    audit,
    creator,
    database,
    service: new BookingRescheduleService(
      audit as unknown as AuditCommandService,
      new AuthorizationPolicyService(),
      creator as unknown as BookingCreateService,
      database as unknown as DatabaseService,
    ),
    transaction,
  };
}

describe('BookingRescheduleService', () => {
  it('cancels the original and creates its linked replacement in one transaction', async () => {
    const { audit, creator, service, transaction } = createService();

    const result = await service.reschedule(context, command, now);

    expect(result).toMatchObject({
      appointment: { artistId: 'artist-2', hostId: 'host-1' },
      original: { id: 'appointment-1', rowVersion: 2, status: 'CANCELLED' },
      replayed: false,
    });
    const creationOptions = creator.createFresh.mock.calls[0]?.[3] as BookingCreationOptions;
    expect(creationOptions).toMatchObject({
      auditAction: 'APPOINTMENT_CREATED_BY_RESCHEDULE',
      eventType: 'APPOINTMENT_RESCHEDULED_TO',
      rescheduledFromAppointmentId: 'appointment-1',
    });
    expect(transaction.appointment.updateMany.mock.calls[0]?.[0]).toMatchObject({
      data: {
        cancellationReasonCode: 'RESCHEDULED',
        cancellationSourceId: creationOptions.appointmentId,
        cancellationSourceType: 'APPOINTMENT',
        status: 'CANCELLED',
      },
    });
    expect(audit.append).toHaveBeenCalledWith(
      transaction,
      context,
      expect.objectContaining({ action: 'APPOINTMENT_RESCHEDULE_SOURCE_CANCELLED' }),
    );
    expect(transaction.outboxEvent.create.mock.calls[0]?.[0]).toMatchObject({
      data: { eventType: 'APPOINTMENT_RESCHEDULED_FROM' },
    });
    expect(creator.completeIdempotency).toHaveBeenCalledOnce();
  });

  it('rolls the transaction back conceptually when replacement creation fails', async () => {
    const { audit, creator, service, transaction } = createService({
      createError: new BookingSlotConflictError(),
    });

    await expect(service.reschedule(context, command, now)).rejects.toBeInstanceOf(
      BookingSlotConflictError,
    );
    expect(transaction.appointment.updateMany).toHaveBeenCalledOnce();
    expect(transaction.outboxEvent.create).not.toHaveBeenCalled();
    expect(audit.append).not.toHaveBeenCalled();
    expect(creator.completeIdempotency).not.toHaveBeenCalled();
  });

  it('replays a completed reschedule before rejecting the now-cancelled original', async () => {
    const cancelled = {
      ...original,
      cancelledAt: new Date('2026-07-22T05:00:00.000Z'),
      rowVersion: 2,
      status: 'CANCELLED',
    };
    const { creator, service, transaction } = createService({
      original: cancelled,
      replay: replacement,
    });

    await expect(service.reschedule(context, command, now)).resolves.toMatchObject({
      appointment: { id: 'replacement-1' },
      original: { id: 'appointment-1', status: 'CANCELLED' },
      replayed: true,
    });
    expect(transaction.appointment.updateMany).not.toHaveBeenCalled();
    expect(creator.createFresh).not.toHaveBeenCalled();
  });

  it('blocks ordinary same-day changes and requires staff reasons', async () => {
    await expect(
      createService().service.reschedule(context, command, new Date('2026-07-23T01:00:00.000Z')),
    ).rejects.toBeInstanceOf(BookingCancellationCutoffError);

    const customerService = {
      ...context,
      roleCode: 'CUSTOMER_SERVICE' as const,
      userId: 'customer-service-1',
    };
    expect(() => createService().service.reschedule(customerService, command, now)).toThrow(
      BookingCancellationReasonInvalidError,
    );
  });

  it('rejects stale originals before creating the replacement', async () => {
    const { creator, service } = createService({ original: { ...original, rowVersion: 2 } });
    await expect(service.reschedule(context, command, now)).rejects.toBeInstanceOf(
      BookingStateConflictError,
    );
    expect(creator.createFresh).not.toHaveBeenCalled();
  });
});
