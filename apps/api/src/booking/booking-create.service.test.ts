import { createHash } from 'node:crypto';

import type { Prisma } from '@makeup/database';
import { describe, expect, it, vi } from 'vitest';

import type { ArtistAvailabilityService } from '../availability/artist-availability.service';
import type { AuditCommandService } from '../audit/audit-command.service';
import {
  AuthorizationDeniedError,
  AuthorizationPolicyService,
} from '../auth/authorization-policy.service';
import type { DatabaseService } from '../database/database.service';
import {
  BookingArtistUnavailableError,
  BookingCreationReasonInvalidError,
  BookingDailyLimitReachedError,
  BookingHostUnavailableError,
  BookingIdempotencyConflictError,
  BookingSecondConfirmationRequiredError,
  BookingSlotConflictError,
} from './booking-create.errors';
import { BookingCreateService } from './booking-create.service';
import type { BookingCommandContext } from './booking-create.types';
import { BookingSiteMismatchError } from './booking-slot.errors';

const now = new Date('2026-07-22T04:00:00.000Z');
const date = new Date('2026-07-23T00:00:00.000Z');
const command = {
  artistId: 'artist-1',
  confirmedSecondBooking: false,
  date,
  durationMinutes: 30,
  hostId: 'host-1',
  idempotencyKey: 'booking-key-0001',
  startMinute: 570,
};
const host = {
  hostCode: 'ZB01001',
  id: 'host-1',
  leaveRecords: [],
  nickname: '小雨',
  operatorRelations: [
    {
      operator: {
        employmentStatus: 'ACTIVE',
        id: 'operator-1',
        realName: '运营甲',
        siteId: 'site-1',
        userId: 'operator-user-1',
      },
    },
  ],
  qualificationStatus: 'ACTIVE',
  realName: '张三',
  site: { name: '松江场地', status: 'ACTIVE' },
  siteId: 'site-1',
  userId: 'host-user-1',
};
const availability = {
  artistId: 'artist-1',
  artistNickname: '柔柔',
  available: true as const,
  date: '2026-07-23',
  intervals: [{ endMinute: 720, startMinute: 540 }],
  overtimeId: null,
  shiftTemplateId: 'shift-1',
  siteId: 'site-1',
  source: 'REGULAR_SHIFT' as const,
};
const appointment = {
  appointmentDate: date,
  appointmentType: 'SINGLE',
  artistId: 'artist-1',
  artistNicknameSnapshot: '柔柔',
  dailySequence: 1,
  durationMinutes: 30,
  endAt: new Date('2026-07-23T02:00:00.000Z'),
  hostCodeSnapshot: 'ZB01001',
  hostId: 'host-1',
  hostNameSnapshot: '小雨',
  id: 'appointment-1',
  operatorIdAtBooking: 'operator-1',
  operatorNameSnapshot: '运营甲',
  rowVersion: 1,
  siteId: 'site-1',
  siteNameSnapshot: '松江场地',
  startAt: new Date('2026-07-23T01:30:00.000Z'),
  status: 'BOOKED',
};
const hostContext: BookingCommandContext = {
  actorName: '小雨',
  roleAssignmentId: 'role-1',
  roleCode: 'HOST',
  siteId: 'site-1',
  userId: 'host-user-1',
};
const customerServiceContext: BookingCommandContext = {
  ...hostContext,
  actorName: '松江客服',
  roleCode: 'CUSTOMER_SERVICE',
  userId: 'customer-service-1',
};

function requestHash(confirmedSecondBooking = false): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        artistId: 'artist-1',
        confirmedSecondBooking,
        date: '2026-07-23',
        durationMinutes: 30,
        hostId: 'host-1',
        startMinute: 570,
      }),
    )
    .digest('hex');
}

function createService(options?: {
  active?: readonly object[];
  availability?: object;
  host?: object | null;
  idempotency?: object | null;
  fixed?: object | null;
  pending?: readonly object[];
}) {
  const transaction = {
    $queryRaw: vi.fn().mockResolvedValue([{ acquired: 1 }]),
    appointment: {
      create: vi.fn().mockResolvedValue(appointment),
      findMany: vi.fn().mockResolvedValue(options?.active ?? []),
      findUnique: vi.fn().mockResolvedValue(appointment),
    },
    fixedAppointmentRequest: {
      findMany: vi.fn().mockResolvedValue(options?.pending ?? []),
    },
    fixedAppointmentRuleWeekday: {
      findFirst: vi.fn().mockResolvedValue(options?.fixed ?? null),
    },
    hostProfile: {
      findUnique: vi.fn().mockResolvedValue(options?.host === undefined ? host : options.host),
    },
    idempotencyRecord: {
      create: vi.fn().mockResolvedValue({ id: 'idempotency-1' }),
      delete: vi.fn().mockResolvedValue({ id: 'idempotency-1' }),
      findUnique: vi.fn().mockResolvedValue(options?.idempotency ?? null),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    outboxEvent: { create: vi.fn().mockResolvedValue({ id: 'event-1' }) },
  };
  const audit = { append: vi.fn().mockResolvedValue('audit-1') };
  const artistAvailability = {
    getDayWithClient: vi.fn().mockResolvedValue(options?.availability ?? availability),
  };
  const database = {
    transaction: vi.fn((operation: (client: Prisma.TransactionClient) => unknown) =>
      operation(transaction as unknown as Prisma.TransactionClient),
    ),
  };
  const service = new BookingCreateService(
    audit as unknown as AuditCommandService,
    artistAvailability as unknown as ArtistAvailabilityService,
    new AuthorizationPolicyService(),
    database as unknown as DatabaseService,
  );
  return { artistAvailability, audit, database, service, transaction };
}

describe('BookingCreateService', () => {
  it('creates the first booking and its audit, outbox and idempotent response atomically', async () => {
    const { audit, service, transaction } = createService();

    const result = await service.create(hostContext, command, now);
    expect(result).toMatchObject({
      appointment: {
        dailySequence: 1,
        id: 'appointment-1',
        startAt: '2026-07-23T01:30:00.000Z',
      },
      replayed: false,
    });
    expect(transaction.$queryRaw).toHaveBeenCalledTimes(7);
    expect(transaction.appointment.create.mock.calls[0]?.[0]).toMatchObject({
      data: {
        artistNicknameSnapshot: '柔柔',
        dailySequence: 1,
        operatorIdAtBooking: 'operator-1',
      },
    });
    expect(audit.append).toHaveBeenCalledWith(
      transaction,
      hostContext,
      expect.objectContaining({ action: 'APPOINTMENT_CREATED' }),
    );
    expect(transaction.outboxEvent.create.mock.calls[0]?.[0]).toMatchObject({
      data: { eventType: 'APPOINTMENT_CREATED' },
    });
    expect(transaction.idempotencyRecord.updateMany.mock.calls[0]?.[0]).toMatchObject({
      data: { responseStatus: 201 },
    });
  });

  it('requires and audits a normalized reason for customer-service creation', async () => {
    expect(() => createService().service.create(customerServiceContext, command, now)).toThrow(
      BookingCreationReasonInvalidError,
    );

    const { audit, service, transaction } = createService();
    await service.create(customerServiceContext, { ...command, reason: '  主播临时加播  ' }, now);

    expect(audit.append).toHaveBeenCalledWith(
      transaction,
      customerServiceContext,
      expect.objectContaining({ reason: '主播临时加播' }),
    );
  });

  it('requires an explicit warning confirmation for the second booking, then uses sequence two', async () => {
    const existing = {
      artistId: 'artist-2',
      dailySequence: 1,
      endAt: new Date('2026-07-23T03:00:00.000Z'),
      hostId: 'host-1',
      startAt: new Date('2026-07-23T02:30:00.000Z'),
    };
    const unconfirmed = createService({ active: [existing] });
    await expect(unconfirmed.service.create(hostContext, command, now)).rejects.toBeInstanceOf(
      BookingSecondConfirmationRequiredError,
    );

    const confirmed = createService({ active: [existing] });
    await confirmed.service.create(hostContext, { ...command, confirmedSecondBooking: true }, now);
    expect(confirmed.transaction.appointment.create.mock.calls[0]?.[0]).toMatchObject({
      data: { dailySequence: 2 },
    });
  });

  it('rejects the third daily booking and any host or artist interval collision', async () => {
    const first = {
      artistId: 'artist-2',
      dailySequence: 1,
      endAt: new Date('2026-07-23T03:00:00.000Z'),
      hostId: 'host-1',
      startAt: new Date('2026-07-23T02:30:00.000Z'),
    };
    const second = { ...first, artistId: 'artist-3', dailySequence: 2 };
    await expect(
      createService({ active: [first, second] }).service.create(hostContext, command, now),
    ).rejects.toBeInstanceOf(BookingDailyLimitReachedError);

    const collision = {
      artistId: 'artist-1',
      dailySequence: 1,
      endAt: new Date('2026-07-23T01:45:00.000Z'),
      hostId: 'host-2',
      startAt: new Date('2026-07-23T01:15:00.000Z'),
    };
    await expect(
      createService({ active: [collision] }).service.create(hostContext, command, now),
    ).rejects.toBeInstanceOf(BookingSlotConflictError);
  });

  it('does not let a single booking bypass approved or pending fixed occupation', async () => {
    await expect(
      createService({ fixed: { ruleId: 'fixed-rule-1' } }).service.create(
        hostContext,
        command,
        now,
      ),
    ).rejects.toBeInstanceOf(BookingSlotConflictError);
    await expect(
      createService({
        pending: [{ targetDurationMinutes: 30, targetStartMinute: 555 }],
      }).service.create(hostContext, command, now),
    ).rejects.toBeInstanceOf(BookingSlotConflictError);
  });

  it('excludes the source fixed rule only while creating a rescheduled replacement', async () => {
    const { service, transaction } = createService();

    await service.createFresh(
      transaction as unknown as Prisma.TransactionClient,
      hostContext,
      command,
      {
        excludeFixedRuleId: 'fixed-rule-1',
        rescheduledFromAppointmentId: 'appointment-0',
      },
    );

    const fixedQuery = transaction.fixedAppointmentRuleWeekday.findFirst.mock.calls[0]?.[0] as {
      where: { ruleId?: { not: string } };
    };
    expect(fixedQuery.where.ruleId).toEqual({ not: 'fixed-rule-1' });
  });

  it('enforces host, current operator and customer-service ownership scopes', async () => {
    const wrongHost = { ...hostContext, userId: 'another-user' };
    await expect(createService().service.create(wrongHost, command, now)).rejects.toBeInstanceOf(
      AuthorizationDeniedError,
    );

    const operatorContext: BookingCommandContext = {
      ...hostContext,
      roleCode: 'OPERATOR',
      userId: 'operator-user-1',
    };
    await expect(
      createService().service.create(operatorContext, command, now),
    ).resolves.toMatchObject({ replayed: false });
    await expect(
      createService().service.create(
        { ...operatorContext, userId: 'former-operator-user' },
        command,
        now,
      ),
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);

    await expect(
      createService().service.create(
        { ...hostContext, roleCode: 'CUSTOMER_SERVICE', siteId: 'site-2' },
        { ...command, reason: '客服代录' },
        now,
      ),
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
  });

  it('revalidates host, artist, site and selected work interval inside the transaction', async () => {
    await expect(
      createService({ host: { ...host, leaveRecords: [{ id: 'leave-1' }] } }).service.create(
        hostContext,
        command,
        now,
      ),
    ).rejects.toBeInstanceOf(BookingHostUnavailableError);

    await expect(
      createService({
        availability: {
          artistId: 'artist-1',
          artistNickname: '柔柔',
          available: false,
          date: '2026-07-23',
          intervals: [],
          reason: 'ARTIST_ON_LEAVE',
          siteId: 'site-1',
        },
      }).service.create(hostContext, command, now),
    ).rejects.toBeInstanceOf(BookingArtistUnavailableError);

    await expect(
      createService({ availability: { ...availability, siteId: 'site-2' } }).service.create(
        hostContext,
        command,
        now,
      ),
    ).rejects.toBeInstanceOf(BookingSiteMismatchError);

    await expect(
      createService({
        availability: { ...availability, intervals: [{ endMinute: 570, startMinute: 540 }] },
      }).service.create(hostContext, command, now),
    ).rejects.toBeInstanceOf(BookingSlotConflictError);
  });

  it('replays an identical completed idempotent request without duplicate writes', async () => {
    const { audit, service, transaction } = createService({
      idempotency: {
        expiresAt: new Date('2026-07-23T05:00:00.000Z'),
        requestHash: requestHash(),
        resourceId: 'appointment-1',
        resourceType: 'APPOINTMENT',
      },
    });

    await expect(service.create(hostContext, command, now)).resolves.toMatchObject({
      appointment: { id: 'appointment-1' },
      replayed: true,
    });
    expect(transaction.hostProfile.findUnique).not.toHaveBeenCalled();
    expect(transaction.appointment.create).not.toHaveBeenCalled();
    expect(transaction.outboxEvent.create).not.toHaveBeenCalled();
    expect(audit.append).not.toHaveBeenCalled();
  });

  it('rejects reusing an idempotency key for different booking content', async () => {
    const { service, transaction } = createService({
      idempotency: {
        expiresAt: new Date('2026-07-23T05:00:00.000Z'),
        requestHash: requestHash(true),
        resourceId: 'appointment-1',
        resourceType: 'APPOINTMENT',
      },
    });

    await expect(service.create(hostContext, command, now)).rejects.toBeInstanceOf(
      BookingIdempotencyConflictError,
    );
    expect(transaction.hostProfile.findUnique).not.toHaveBeenCalled();
  });
});
