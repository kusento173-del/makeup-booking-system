import type { Prisma } from '@makeup/database';
import { describe, expect, it, vi } from 'vitest';

import type { DatabaseService } from '../database/database.service';
import { NotificationScheduleService } from './notification-schedule.service';

const now = new Date('2026-07-23T00:00:00.000Z');
const appointment = {
  appointmentDate: new Date('2026-07-23T00:00:00.000Z'),
  artist: { id: 'artist-1', nickname: '柔柔', user: null },
  artistNicknameSnapshot: '柔柔',
  durationMinutes: 30,
  endAt: new Date('2026-07-23T02:00:00.000Z'),
  host: {
    hostCode: 'ZB0001',
    id: 'host-1',
    nickname: '小雨',
    realName: '主播一',
    user: { id: 'host-user-1', status: 'ACTIVE' },
  },
  hostCodeSnapshot: 'ZB0001',
  hostNameSnapshot: '小雨',
  id: 'appointment-1',
  siteId: 'site-1',
  siteNameSnapshot: '松江',
  startAt: new Date('2026-07-23T01:30:00.000Z'),
};

function setup(options?: {
  readonly appointments?: readonly object[];
  readonly cancelledCount?: number;
  readonly template?: object | null;
}) {
  const transaction = {
    appointment: {
      findMany: vi.fn().mockResolvedValue(options?.appointments ?? [appointment]),
    },
    notificationTask: {
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
      updateMany: vi.fn().mockResolvedValue({ count: options?.cancelledCount ?? 0 }),
    },
    notificationTemplateVersion: {
      findFirst: vi
        .fn()
        .mockResolvedValue(
          options?.template === undefined ? { id: 'reminder-template' } : options.template,
        ),
    },
  };
  const database = {
    transaction: vi.fn((operation: (client: Prisma.TransactionClient) => unknown) =>
      operation(transaction as unknown as Prisma.TransactionClient),
    ),
  };
  return {
    service: new NotificationScheduleService(database as unknown as DatabaseService),
    transaction,
  };
}

describe('NotificationScheduleService reminders', () => {
  it('creates one idempotent reminder scheduled one hour before the appointment', async () => {
    const { service, transaction } = setup();

    await expect(service.runReminderBatch('WECHAT_MINI_PROGRAM', 100, now)).resolves.toEqual({
      cancelledTaskCount: 0,
      createdTaskCount: 1,
      templateAvailable: true,
    });
    const findInput = transaction.appointment.findMany.mock.calls[0]?.[0] as unknown as {
      take: number;
      where: {
        notificationTasks: {
          none: {
            recipientRoleCode: string;
            templateVersion: { templateCode: string };
          };
        };
        status: string;
      };
    };
    expect(findInput.take).toBe(100);
    expect(findInput.where).toMatchObject({
      notificationTasks: {
        none: {
          recipientRoleCode: 'HOST',
          templateVersion: { templateCode: 'APPOINTMENT_REMINDER' },
        },
      },
      status: 'BOOKED',
    });
    const createInput = transaction.notificationTask.createMany.mock.calls[0]?.[0] as unknown as {
      data: readonly {
        appointmentId: string;
        businessKey: string;
        payload: Record<string, unknown>;
        scheduledAt: Date;
      }[];
      skipDuplicates: boolean;
    };
    expect(createInput.skipDuplicates).toBe(true);
    expect(createInput.data[0]).toMatchObject({
      appointmentId: 'appointment-1',
      businessKey: 'APPOINTMENT_REMINDER:appointment-1:HOST:host-1',
      payload: {
        appointmentDateTime: '2026-07-23 09:30',
        appointmentStatus: '即将开始',
      },
      scheduledAt: new Date('2026-07-23T00:30:00.000Z'),
    });
  });

  it('cancels pending reminders for inactive appointments even without an active template', async () => {
    const { service, transaction } = setup({
      appointments: [],
      cancelledCount: 2,
      template: null,
    });

    await expect(service.runReminderBatch('WECHAT_MINI_PROGRAM', 100, now)).resolves.toEqual({
      cancelledTaskCount: 2,
      createdTaskCount: 0,
      templateAvailable: false,
    });
    expect(transaction.notificationTask.updateMany).toHaveBeenCalledWith({
      data: {
        cancelledAt: now,
        nextAttemptAt: null,
        rowVersion: { increment: 1 },
        status: 'CANCELLED',
      },
      where: {
        appointment: { is: { status: { not: 'BOOKED' } } },
        status: { in: ['PENDING', 'RETRY_WAIT'] },
        templateVersion: { templateCode: 'APPOINTMENT_REMINDER' },
      },
    });
    expect(transaction.appointment.findMany).not.toHaveBeenCalled();
  });

  it('rejects an unbounded reminder scan', async () => {
    const { service } = setup();
    await expect(service.runReminderBatch('WECHAT_MINI_PROGRAM', 101, now)).rejects.toThrow(
      'Notification reminder batch limit is invalid',
    );
  });
});

function summarySetup(options?: {
  readonly existing?: readonly object[];
  readonly templates?: readonly object[];
}) {
  const artists = [
    {
      id: 'artist-1',
      nickname: '柔柔',
      site: { name: '松江' },
      siteId: 'site-1',
      user: { id: 'artist-user-1', status: 'ACTIVE' },
    },
    {
      id: 'artist-2',
      nickname: '江江',
      site: { name: '松江' },
      siteId: 'site-1',
      user: null,
    },
  ];
  const operators = [
    {
      id: 'operator-1',
      realName: '运营甲',
      site: { name: '松江' },
      siteId: 'site-1',
      user: { id: 'operator-user-1', status: 'ACTIVE' },
    },
  ];
  const transaction = {
    appointment: {
      findMany: vi.fn().mockResolvedValue([{ artistId: 'artist-1', hostId: 'host-1' }]),
    },
    artistProfile: { findMany: vi.fn().mockResolvedValue(artists) },
    hostOperatorRelation: {
      findMany: vi.fn().mockResolvedValue([
        { hostId: 'host-1', operatorId: 'operator-1' },
        { hostId: 'host-2', operatorId: 'operator-1' },
      ]),
    },
    notificationTask: {
      createMany: vi.fn().mockResolvedValue({ count: 3 }),
      findMany: vi.fn().mockResolvedValue(options?.existing ?? []),
    },
    notificationTemplateVersion: {
      findMany: vi.fn().mockResolvedValue(
        options?.templates ?? [
          { id: 'summary-artist', recipientRoleCode: 'ARTIST' },
          { id: 'summary-operator', recipientRoleCode: 'OPERATOR' },
        ],
      ),
    },
    operatorProfile: { findMany: vi.fn().mockResolvedValue(operators) },
  };
  const database = {
    transaction: vi.fn((operation: (client: Prisma.TransactionClient) => unknown) =>
      operation(transaction as unknown as Prisma.TransactionClient),
    ),
  };
  return {
    database,
    service: new NotificationScheduleService(database as unknown as DatabaseService),
    transaction,
  };
}

describe('NotificationScheduleService daily summaries', () => {
  it('waits until 00:01 Shanghai time before locking the daily summary', async () => {
    const { database, service } = summarySetup();

    await expect(
      service.runDailySummary('WECHAT_MINI_PROGRAM', new Date('2026-07-22T16:00:30.000Z')),
    ).resolves.toEqual({
      createdTaskCount: 0,
      eligible: false,
      missingTemplateRoles: [],
    });
    expect(database.transaction).not.toHaveBeenCalled();
  });

  it('creates artist and operator summaries including zero-booking people and hosts', async () => {
    const { service, transaction } = summarySetup();
    const summaryNow = new Date('2026-07-22T16:01:00.000Z');

    await expect(service.runDailySummary('WECHAT_MINI_PROGRAM', summaryNow)).resolves.toEqual({
      createdTaskCount: 3,
      eligible: true,
      missingTemplateRoles: [],
    });
    const createInput = transaction.notificationTask.createMany.mock.calls[0]?.[0] as unknown as {
      data: readonly {
        businessKey: string;
        failedAt?: Date;
        lastErrorCode?: string;
        payload: Record<string, unknown>;
        recipientRoleCode: string;
        status?: string;
      }[];
      skipDuplicates: boolean;
    };
    expect(createInput.skipDuplicates).toBe(true);
    const artistTask = createInput.data.find(
      (task) => task.businessKey === 'DAILY_SCHEDULE:2026-07-23:ARTIST:artist-1',
    );
    expect(artistTask).toMatchObject({ recipientRoleCode: 'ARTIST' });
    expect(artistTask?.payload).toMatchObject({
      appointmentCount: 1,
      scheduleStatus: '今日有预约',
    });
    const unboundArtistTask = createInput.data.find(
      (task) => task.businessKey === 'DAILY_SCHEDULE:2026-07-23:ARTIST:artist-2',
    );
    expect(unboundArtistTask).toMatchObject({
      lastErrorCode: 'RECIPIENT_UNBOUND',
      status: 'FAILED',
    });
    expect(unboundArtistTask?.payload).toMatchObject({
      appointmentCount: 0,
      scheduleStatus: '今日无预约',
    });
    const operatorTask = createInput.data.find(
      (task) => task.businessKey === 'DAILY_SCHEDULE:2026-07-23:OPERATOR:operator-1',
    );
    expect(operatorTask).toMatchObject({ recipientRoleCode: 'OPERATOR' });
    expect(operatorTask?.payload).toMatchObject({
      appointmentCount: 1,
      bookedHostCount: 1,
      hostCount: 2,
      unbookedHostCount: 1,
    });
    const appointmentInput = transaction.appointment.findMany.mock.calls[0]?.[0] as unknown as {
      where: { appointmentDate: Date };
    };
    expect(appointmentInput.where.appointmentDate).toEqual(new Date('2026-07-23T00:00:00.000Z'));
  });

  it('creates only missing scopes and reports unavailable role templates', async () => {
    const { service, transaction } = summarySetup({
      existing: [{ recipientProfileId: 'operator-1', recipientRoleCode: 'OPERATOR' }],
      templates: [{ id: 'summary-operator', recipientRoleCode: 'OPERATOR' }],
    });
    transaction.notificationTask.createMany.mockResolvedValue({ count: 0 });

    await expect(
      service.runDailySummary('WECHAT_MINI_PROGRAM', new Date('2026-07-22T16:01:00.000Z')),
    ).resolves.toEqual({
      createdTaskCount: 0,
      eligible: true,
      missingTemplateRoles: ['ARTIST'],
    });
    expect(transaction.artistProfile.findMany).not.toHaveBeenCalled();
    expect(transaction.notificationTask.createMany).not.toHaveBeenCalled();
  });
});
