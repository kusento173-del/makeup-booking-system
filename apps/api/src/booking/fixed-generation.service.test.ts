import type { DatabaseClient, Prisma } from '@makeup/database';
import { describe, expect, it, vi } from 'vitest';

import type { ArtistAvailabilityService } from '../availability/artist-availability.service';
import type { AuditCommandService } from '../audit/audit-command.service';
import type { DatabaseService } from '../database/database.service';
import { FixedGenerationService } from './fixed-generation.service';

const now = new Date('2026-07-22T04:00:00.000Z');
const rule = {
  artist: { nickname: '柔柔' },
  artistId: 'artist-1',
  durationMinutes: 30,
  host: {
    hostCode: 'ZB01001',
    nickname: '小雨',
    qualificationStatus: 'ACTIVE',
    realName: '张三',
    site: { name: '松江场地', status: 'ACTIVE' },
  },
  hostId: 'host-1',
  id: 'rule-1',
  siteId: 'site-1',
  startMinute: 540,
  validFrom: new Date('2026-07-23T00:00:00.000Z'),
  validUntil: null,
  weekdays: [{ isoWeekday: 2 }],
};

function createService(options?: {
  artistAvailable?: boolean;
  existing?: object | null;
  ruleStillEffective?: boolean;
}) {
  const transaction = {
    $queryRaw: vi.fn().mockResolvedValue([{ acquired: 1 }]),
    appointment: {
      create: vi.fn().mockResolvedValue({ id: 'appointment-1' }),
      findFirst: vi.fn().mockResolvedValue(options?.existing ?? null),
      findMany: vi.fn().mockResolvedValue([]),
    },
    fixedAppointmentRule: {
      findFirst: vi
        .fn()
        .mockResolvedValueOnce(rule)
        .mockResolvedValue(options?.ruleStillEffective === false ? null : rule),
    },
    hostOperatorRelation: {
      findFirst: vi.fn().mockResolvedValue({
        operator: { id: 'operator-1', realName: '运营甲' },
      }),
    },
    leaveRecord: { findFirst: vi.fn().mockResolvedValue(null) },
  };
  const client = {
    fixedAppointmentRule: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: rule.id,
          validFrom: rule.validFrom,
          validUntil: rule.validUntil,
          weekdays: rule.weekdays,
        },
      ]),
    },
  };
  const database = {
    read: vi.fn((operation: (value: DatabaseClient) => unknown) =>
      operation(client as unknown as DatabaseClient),
    ),
    transaction: vi.fn((operation: (value: Prisma.TransactionClient) => unknown) =>
      operation(transaction as unknown as Prisma.TransactionClient),
    ),
  };
  const availability = {
    getDayWithClient: vi.fn().mockResolvedValue(
      options?.artistAvailable === false
        ? { available: false, reason: 'ARTIST_ON_LEAVE' }
        : {
            artistNickname: '柔柔',
            available: true,
            intervals: [{ endMinute: 720, startMinute: 540 }],
          },
    ),
  };
  const audit = { append: vi.fn().mockResolvedValue('audit-1') };
  const service = new FixedGenerationService(
    audit as unknown as AuditCommandService,
    availability as unknown as ArtistAvailabilityService,
    database as unknown as DatabaseService,
  );
  return { audit, availability, service, transaction };
}

describe('FixedGenerationService', () => {
  it('generates matching dates with snapshots, lineage and audit', async () => {
    const { audit, service, transaction } = createService();

    const result = await service.run(now);

    expect(result).toEqual({
      generated: 1,
      skipped: {
        ALREADY_PROCESSED: 0,
        ARTIST_UNAVAILABLE: 0,
        HOST_DAILY_LIMIT: 0,
        HOST_UNAVAILABLE: 0,
        SLOT_CONFLICT: 0,
      },
      windowFrom: '2026-07-23',
      windowThrough: '2026-07-30',
    });
    expect(transaction.appointment.create.mock.calls[0]?.[0]).toMatchObject({
      data: {
        appointmentDate: new Date('2026-07-28T00:00:00.000Z'),
        appointmentType: 'FIXED',
        createdByRole: 'SYSTEM',
        dailySequence: 1,
        fixedRuleId: 'rule-1',
        operatorIdAtBooking: 'operator-1',
      },
    });
    expect(audit.append).toHaveBeenCalledOnce();
  });

  it('does not rebuild historical dates and skips artist leave without writing', async () => {
    const existing = createService({ existing: { id: 'old-appointment' } });
    await expect(existing.service.run(now)).resolves.toMatchObject({
      generated: 0,
      skipped: { ALREADY_PROCESSED: 1 },
    });
    expect(existing.transaction.appointment.create).not.toHaveBeenCalled();

    const leave = createService({ artistAvailable: false });
    await expect(leave.service.run(now)).resolves.toMatchObject({
      generated: 0,
      skipped: { ARTIST_UNAVAILABLE: 1 },
    });
    expect(leave.transaction.appointment.create).not.toHaveBeenCalled();
  });

  it('does not generate after a concurrent rule change wins the schedule locks', async () => {
    const changed = createService({ ruleStillEffective: false });

    await expect(changed.service.run(now)).resolves.toMatchObject({
      generated: 0,
      skipped: { ALREADY_PROCESSED: 1 },
    });
    expect(changed.transaction.appointment.create).not.toHaveBeenCalled();
  });
});
