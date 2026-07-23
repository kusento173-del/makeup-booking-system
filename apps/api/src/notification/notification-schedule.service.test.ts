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
