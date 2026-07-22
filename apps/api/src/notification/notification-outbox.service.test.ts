import type { Prisma } from '@makeup/database';
import { describe, expect, it, vi } from 'vitest';

import type { DatabaseService } from '../database/database.service';
import { NotificationOutboxService } from './notification-outbox.service';

const now = new Date('2026-07-22T12:00:00.000Z');
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
const operatorRelation = {
  operator: {
    id: 'operator-1',
    realName: '运营甲',
    user: { id: 'operator-user-1', status: 'ACTIVE' },
  },
};

function createService(options?: {
  readonly appointments?: Readonly<Record<string, object>>;
  readonly createCount?: number;
  readonly event?: object | null;
  readonly operatorRelation?: object | null;
  readonly template?: object | null;
}) {
  const event =
    options?.event === undefined
      ? {
          eventType: 'APPOINTMENT_CREATED',
          id: 'event-1',
          payload: { appointmentId: 'appointment-1' },
        }
      : options.event;
  const appointments = options?.appointments ?? { 'appointment-1': appointment };
  const transaction = {
    $queryRaw: vi.fn().mockResolvedValue(event ? [event] : []),
    appointment: {
      findUnique: vi.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(appointments[where.id] ?? null),
      ),
    },
    hostOperatorRelation: {
      findFirst: vi
        .fn()
        .mockResolvedValue(
          options?.operatorRelation === undefined ? operatorRelation : options.operatorRelation,
        ),
    },
    notificationTask: {
      createMany: vi.fn().mockResolvedValue({ count: options?.createCount ?? 3 }),
    },
    notificationTemplateVersion: {
      findFirst: vi
        .fn()
        .mockResolvedValue(
          options?.template === undefined ? { id: 'template-1' } : options.template,
        ),
    },
    outboxEvent: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
  };
  const database = {
    transaction: vi.fn((operation: (client: Prisma.TransactionClient) => unknown) =>
      operation(transaction as unknown as Prisma.TransactionClient),
    ),
  };
  return {
    service: new NotificationOutboxService(database as unknown as DatabaseService),
    transaction,
  };
}

describe('NotificationOutboxService', () => {
  it('creates host, artist and current-operator tasks before publishing an appointment event', async () => {
    const { service, transaction } = createService();

    await expect(service.runOne('WECHAT_MINI_PROGRAM', now)).resolves.toEqual({
      eventId: 'event-1',
      status: 'CREATED',
      taskCount: 3,
    });

    const createInput = transaction.notificationTask.createMany.mock.calls[0]?.[0] as unknown as {
      data: readonly {
        businessKey: string;
        lastErrorCode?: string;
        recipientRoleCode: string;
        recipientUserId?: string;
        status?: string;
      }[];
    };
    const tasks = createInput.data;
    expect(tasks).toHaveLength(3);
    expect(tasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          businessKey: 'APPOINTMENT_CREATED:appointment-1:HOST:host-1',
          recipientRoleCode: 'HOST',
          recipientUserId: 'host-user-1',
        }),
        expect.objectContaining({
          lastErrorCode: 'RECIPIENT_UNBOUND',
          recipientRoleCode: 'ARTIST',
          status: 'FAILED',
        }),
        expect.objectContaining({
          recipientRoleCode: 'OPERATOR',
          recipientUserId: 'operator-user-1',
        }),
      ]),
    );
    const publishInput = transaction.outboxEvent.updateMany.mock.calls.at(-1)?.[0] as unknown as {
      data: { status?: string };
    };
    expect(publishInput.data.status).toBe('PUBLISHED');
  });

  it('defers a supported event without an active channel template', async () => {
    const { service, transaction } = createService({ template: null });

    await expect(service.runOne('WECHAT_MINI_PROGRAM', now)).resolves.toEqual({
      eventId: 'event-1',
      status: 'DEFERRED',
      taskCount: 0,
    });
    expect(transaction.notificationTask.createMany).not.toHaveBeenCalled();
    expect(transaction.outboxEvent.updateMany).toHaveBeenCalledWith({
      data: {
        attemptCount: { increment: 1 },
        availableAt: new Date('2026-07-22T12:05:00.000Z'),
      },
      where: { id: 'event-1', status: 'PENDING' },
    });
  });

  it('uses the replacement identity and only the old artist for a reschedule-source event', async () => {
    const original = {
      ...appointment,
      artist: {
        id: 'artist-old',
        nickname: '原化妆师',
        user: { id: 'artist-old-user', status: 'ACTIVE' },
      },
      id: 'appointment-old',
    };
    const replacement = { ...appointment, id: 'appointment-new' };
    const { service, transaction } = createService({
      appointments: { 'appointment-new': replacement, 'appointment-old': original },
      createCount: 1,
      event: {
        eventType: 'APPOINTMENT_RESCHEDULED_FROM',
        id: 'event-old',
        payload: {
          appointmentId: 'appointment-old',
          replacementAppointmentId: 'appointment-new',
        },
      },
    });

    await expect(service.runOne('WECHAT_MINI_PROGRAM', now)).resolves.toMatchObject({
      status: 'CREATED',
      taskCount: 1,
    });
    const createInput = transaction.notificationTask.createMany.mock.calls[0]?.[0] as unknown as {
      data: readonly {
        businessKey: string;
        recipientProfileId: string;
        recipientRoleCode: string;
      }[];
    };
    const tasks = createInput.data;
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      businessKey: 'APPOINTMENT_RESCHEDULED:appointment-new:ARTIST:artist-old',
      recipientProfileId: 'artist-old',
      recipientRoleCode: 'ARTIST',
    });
    expect(transaction.hostOperatorRelation.findFirst).not.toHaveBeenCalled();
  });

  it('reports no new tasks when another reschedule event already created the same business keys', async () => {
    const { service } = createService({ createCount: 0 });

    await expect(service.runOne('WECHAT_MINI_PROGRAM', now)).resolves.toMatchObject({
      status: 'CREATED',
      taskCount: 0,
    });
  });

  it('returns without writes when there is no supported ready event', async () => {
    const { service, transaction } = createService({ event: null });

    await expect(service.runOne('WECHAT_MINI_PROGRAM', now)).resolves.toEqual({
      eventId: null,
      status: 'EMPTY',
      taskCount: 0,
    });
    expect(transaction.notificationTemplateVersion.findFirst).not.toHaveBeenCalled();
    expect(transaction.outboxEvent.updateMany).not.toHaveBeenCalled();
  });
});
