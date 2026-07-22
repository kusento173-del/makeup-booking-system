import type { Prisma } from '@makeup/database';
import { describe, expect, it, vi } from 'vitest';

import type { AuditCommandService } from '../audit/audit-command.service';
import {
  AuthorizationDeniedError,
  AuthorizationPolicyService,
} from '../auth/authorization-policy.service';
import type { DatabaseService } from '../database/database.service';
import { FixedAvailabilityDateInvalidError } from './fixed-availability.errors';
import type { FixedAvailabilityService } from './fixed-availability.service';
import { FixedRequestUnavailableError } from './fixed-request.errors';
import { FixedRequestService } from './fixed-request.service';

const now = new Date('2026-07-22T04:00:00.000Z');
const context = {
  actorName: '运营小周',
  roleAssignmentId: 'role-1',
  roleCode: 'OPERATOR' as const,
  siteId: 'site-1',
  userId: 'operator-user-1',
};
const command = {
  artistId: 'artist-1',
  durationMinutes: 30,
  effectiveFrom: new Date('2026-07-27T00:00:00.000Z'),
  hostId: 'host-1',
  idempotencyKey: 'fixed-key-0001',
  reason: '  长期固定直播安排  ',
  startMinute: 540,
  weekdays: [3, 1],
};
const record = {
  effectiveFrom: new Date('2026-07-27T00:00:00.000Z'),
  hostId: 'host-1',
  id: 'request-1',
  reason: '长期固定直播安排',
  requestType: 'CREATE',
  rowVersion: 1,
  siteId: 'site-1',
  status: 'PENDING',
  submittedAt: new Date('2026-07-22T05:00:00.000Z'),
  submittedByOperatorId: 'operator-1',
  targetArtistId: 'artist-1',
  targetDurationMinutes: 30,
  targetStartMinute: 540,
  targetWeekdays: [1, 3],
};

function createService(options?: { replay?: boolean; unavailable?: boolean }) {
  const transaction = {
    $queryRaw: vi.fn().mockResolvedValue([{ acquired: 1 }]),
    fixedAppointmentRequest: {
      create: vi.fn().mockResolvedValue(record),
      findUnique: vi.fn().mockResolvedValue(record),
    },
    idempotencyRecord: {
      create: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
      findUnique: vi.fn().mockResolvedValue(
        options?.replay
          ? {
              expiresAt: new Date('2026-07-23T04:00:00.000Z'),
              requestHash: 'b816f0dd5a690f91da30e3a555fd1b818e4f0cc9a03723ad53c524f733e17e8d',
              resourceId: 'request-1',
              resourceType: 'FIXED_REQUEST',
            }
          : null,
      ),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    operatorProfile: {
      findUnique: vi.fn().mockResolvedValue({
        employmentStatus: 'ACTIVE',
        id: 'operator-1',
        siteId: 'site-1',
      }),
    },
    outboxEvent: { create: vi.fn().mockResolvedValue({}) },
  };
  const database = {
    transaction: vi.fn((operation: (value: Prisma.TransactionClient) => unknown) =>
      operation(transaction as unknown as Prisma.TransactionClient),
    ),
  };
  const availability = {
    getAvailabilityWithClient: vi.fn().mockResolvedValue({
      slots: options?.unavailable
        ? [
            {
              available: false,
              earliestStartDate: null,
              startMinute: 540,
            },
          ]
        : [
            {
              available: true,
              earliestStartDate: '2026-07-27',
              startMinute: 540,
            },
          ],
      unavailableReason: null,
    }),
  };
  const audit = { append: vi.fn().mockResolvedValue('audit-1') };
  const service = new FixedRequestService(
    audit as unknown as AuditCommandService,
    new AuthorizationPolicyService(),
    availability as unknown as FixedAvailabilityService,
    database as unknown as DatabaseService,
  );
  return { audit, availability, service, transaction };
}

describe('FixedRequestService', () => {
  it('creates a normalized pending request with audit, outbox and completed idempotency', async () => {
    const { audit, availability, service, transaction } = createService();

    const result = await service.create(context, command, now);

    expect(result).toEqual({
      replayed: false,
      request: {
        ...record,
        effectiveFrom: '2026-07-27',
        submittedAt: '2026-07-22T05:00:00.000Z',
      },
    });
    expect(transaction.$queryRaw).toHaveBeenCalledTimes(10);
    expect(availability.getAvailabilityWithClient).toHaveBeenCalledWith(
      transaction,
      context,
      {
        artistId: 'artist-1',
        durationMinutes: 30,
        hostId: 'host-1',
        requestedStartDate: new Date('2026-07-27T00:00:00.000Z'),
        weekdays: [1, 3],
      },
      now,
    );
    expect(transaction.fixedAppointmentRequest.create.mock.calls[0]?.[0]).toMatchObject({
      data: { reason: '长期固定直播安排', targetWeekdays: [1, 3] },
    });
    expect(audit.append).toHaveBeenCalledOnce();
    expect(transaction.outboxEvent.create).toHaveBeenCalledOnce();
    expect(transaction.idempotencyRecord.updateMany.mock.calls[0]?.[0]).toMatchObject({
      data: { resourceId: 'request-1', resourceType: 'FIXED_REQUEST' },
    });
  });

  it('replays a completed request without revalidating or writing business data', async () => {
    const { availability, service, transaction } = createService({ replay: true });

    await expect(service.create(context, command, now)).resolves.toMatchObject({ replayed: true });

    expect(availability.getAvailabilityWithClient).not.toHaveBeenCalled();
    expect(transaction.fixedAppointmentRequest.create).not.toHaveBeenCalled();
  });

  it('rejects a slot changed after the availability screen was loaded', async () => {
    const { service, transaction } = createService({ unavailable: true });

    await expect(service.create(context, command, now)).rejects.toBeInstanceOf(
      FixedRequestUnavailableError,
    );
    expect(transaction.fixedAppointmentRequest.create).not.toHaveBeenCalled();
  });

  it('allows only operators and rejects same-day effective dates before opening a transaction', () => {
    const { service, transaction } = createService();
    expect(() => service.create({ ...context, roleCode: 'ADMIN' }, command, now)).toThrow(
      AuthorizationDeniedError,
    );
    expect(() =>
      service.create(
        context,
        { ...command, effectiveFrom: new Date('2026-07-22T00:00:00.000Z') },
        now,
      ),
    ).toThrow(FixedAvailabilityDateInvalidError);
    expect(transaction.fixedAppointmentRequest.create).not.toHaveBeenCalled();
  });
});
