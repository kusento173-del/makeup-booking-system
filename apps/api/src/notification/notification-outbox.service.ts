import { Prisma } from '@makeup/database';
import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../database/database.service';
import { formatDateOnly } from '../shift/business-date';
import {
  NOTIFICATION_EVENT_TYPES,
  type NotificationChannel,
  type NotificationEventType,
  type NotificationOutboxBatchResult,
  type NotificationOutboxResult,
} from './notification.types';

interface ClaimedEvent {
  readonly eventType: NotificationEventType;
  readonly id: string;
  readonly payload: unknown;
}

interface EventPayload {
  readonly appointmentId: string;
  readonly replacementAppointmentId?: string;
}

interface Recipient {
  readonly name: string;
  readonly profileId: string;
  readonly roleCode: 'ARTIST' | 'HOST' | 'OPERATOR';
  readonly userId: string | null;
  readonly userStatus: string | null;
}

const EVENT_TEMPLATE: Readonly<Record<NotificationEventType, string>> = {
  APPOINTMENT_CANCELLED: 'APPOINTMENT_CANCELLED',
  APPOINTMENT_CREATED: 'APPOINTMENT_CREATED',
  APPOINTMENT_RESCHEDULED_FROM: 'APPOINTMENT_RESCHEDULED',
  APPOINTMENT_RESCHEDULED_TO: 'APPOINTMENT_RESCHEDULED',
  FIXED_APPOINTMENT_CANCELLED_BY_RULE_REQUEST: 'APPOINTMENT_CANCELLED',
  FIXED_APPOINTMENT_GENERATED: 'APPOINTMENT_CREATED',
};

const APPOINTMENT_SELECT = {
  appointmentDate: true,
  artist: {
    select: {
      id: true,
      nickname: true,
      user: { select: { id: true, status: true } },
    },
  },
  artistNicknameSnapshot: true,
  durationMinutes: true,
  endAt: true,
  host: {
    select: {
      hostCode: true,
      id: true,
      nickname: true,
      realName: true,
      user: { select: { id: true, status: true } },
    },
  },
  hostCodeSnapshot: true,
  hostNameSnapshot: true,
  id: true,
  siteId: true,
  siteNameSnapshot: true,
  startAt: true,
} satisfies Prisma.AppointmentSelect;

type AppointmentRecord = Prisma.AppointmentGetPayload<{ select: typeof APPOINTMENT_SELECT }>;

@Injectable()
export class NotificationOutboxService {
  constructor(private readonly database: DatabaseService) {}

  async runBatch(
    channel: NotificationChannel,
    limit = 100,
    now = new Date(),
  ): Promise<NotificationOutboxBatchResult> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw new Error('Notification outbox batch limit is invalid');
    }
    let deferredEventCount = 0;
    let processedEventCount = 0;
    let taskCount = 0;
    for (let index = 0; index < limit; index += 1) {
      const result = await this.runOne(channel, now);
      if (result.status === 'EMPTY') break;
      processedEventCount += 1;
      taskCount += result.taskCount;
      if (result.status === 'DEFERRED') deferredEventCount += 1;
    }
    return { deferredEventCount, processedEventCount, taskCount };
  }

  runOne(channel: NotificationChannel, now = new Date()): Promise<NotificationOutboxResult> {
    return this.database.transaction(async (transaction) => {
      const event = await this.claim(transaction, now);
      if (!event) return { eventId: null, status: 'EMPTY', taskCount: 0 };

      const templateCode = EVENT_TEMPLATE[event.eventType];
      const template = await transaction.notificationTemplateVersion.findFirst({
        orderBy: { version: 'desc' },
        select: { id: true },
        where: { channel, status: 'ACTIVE', templateCode },
      });
      if (!template) {
        await transaction.outboxEvent.updateMany({
          data: {
            attemptCount: { increment: 1 },
            availableAt: new Date(now.getTime() + 5 * 60_000),
          },
          where: { id: event.id, status: 'PENDING' },
        });
        return { eventId: event.id, status: 'DEFERRED', taskCount: 0 };
      }

      const payload = this.payload(event.payload);
      const replacementId =
        event.eventType === 'APPOINTMENT_RESCHEDULED_FROM'
          ? payload.replacementAppointmentId
          : undefined;
      if (event.eventType === 'APPOINTMENT_RESCHEDULED_FROM' && !replacementId) {
        throw new Error('Reschedule source event has no replacement appointment');
      }
      const appointment = await this.appointment(
        transaction,
        replacementId ?? payload.appointmentId,
      );
      const recipients = await this.recipients(transaction, event, payload, appointment);
      const businessRoot = replacementId ?? appointment.id;
      const taskPayload = this.taskPayload(appointment);
      const data = recipients.map((recipient) => {
        const available = recipient.userId !== null && recipient.userStatus === 'ACTIVE';
        return {
          businessKey: `${templateCode}:${businessRoot}:${recipient.roleCode}:${recipient.profileId}`,
          ...(available
            ? { recipientUserId: recipient.userId }
            : {
                failedAt: now,
                lastErrorCode: recipient.userId
                  ? 'RECIPIENT_ACCOUNT_UNAVAILABLE'
                  : 'RECIPIENT_UNBOUND',
                lastErrorSummary: recipient.userId
                  ? '接收人账号当前不可用'
                  : '接收人尚未绑定微信账号',
                ...(recipient.userId ? { recipientUserId: recipient.userId } : {}),
                status: 'FAILED',
              }),
          payload: taskPayload,
          recipientNameSnapshot: recipient.name,
          recipientProfileId: recipient.profileId,
          recipientRoleCode: recipient.roleCode,
          scheduledAt: now,
          siteId: appointment.siteId,
          sourceOutboxEventId: event.id,
          templateVersionId: template.id,
        } satisfies Prisma.NotificationTaskCreateManyInput;
      });
      const created =
        data.length > 0
          ? await transaction.notificationTask.createMany({ data, skipDuplicates: true })
          : { count: 0 };
      const published = await transaction.outboxEvent.updateMany({
        data: {
          attemptCount: { increment: 1 },
          publishedAt: now,
          status: 'PUBLISHED',
        },
        where: { id: event.id, status: 'PENDING' },
      });
      if (published.count !== 1) throw new Error('Notification outbox event changed while locked');
      return { eventId: event.id, status: 'CREATED', taskCount: created.count };
    });
  }

  private async claim(
    transaction: Prisma.TransactionClient,
    now: Date,
  ): Promise<ClaimedEvent | null> {
    const events = await transaction.$queryRaw<ClaimedEvent[]>(Prisma.sql`
      SELECT "id", "event_type" AS "eventType", "payload"
      FROM "outbox_events"
      WHERE "status" = 'PENDING'
        AND "available_at" <= ${now}
        AND "event_type" IN (${Prisma.join(NOTIFICATION_EVENT_TYPES)})
      ORDER BY "available_at", "created_at", "id"
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    `);
    return events[0] ?? null;
  }

  private payload(value: unknown): EventPayload {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Notification outbox payload is invalid');
    }
    const payload = value as Record<string, unknown>;
    if (typeof payload['appointmentId'] !== 'string') {
      throw new Error('Notification outbox appointment is invalid');
    }
    const replacementAppointmentId = payload['replacementAppointmentId'];
    if (replacementAppointmentId !== undefined && typeof replacementAppointmentId !== 'string') {
      throw new Error('Notification outbox replacement is invalid');
    }
    return {
      appointmentId: payload['appointmentId'],
      ...(replacementAppointmentId ? { replacementAppointmentId } : {}),
    };
  }

  private appointment(transaction: Prisma.TransactionClient, id: string) {
    return transaction.appointment
      .findUnique({ select: APPOINTMENT_SELECT, where: { id } })
      .then((appointment) => {
        if (!appointment) throw new Error('Notification appointment was not found');
        return appointment;
      });
  }

  private async recipients(
    transaction: Prisma.TransactionClient,
    event: ClaimedEvent,
    payload: EventPayload,
    appointment: AppointmentRecord,
  ): Promise<readonly Recipient[]> {
    if (event.eventType === 'APPOINTMENT_RESCHEDULED_FROM') {
      const original = await this.appointment(transaction, payload.appointmentId);
      return [this.artistRecipient(original)];
    }

    const recipients: Recipient[] = [
      {
        name: appointment.host.nickname ?? appointment.host.realName,
        profileId: appointment.host.id,
        roleCode: 'HOST',
        userId: appointment.host.user?.id ?? null,
        userStatus: appointment.host.user?.status ?? null,
      },
      this.artistRecipient(appointment),
    ];
    const relation = await transaction.hostOperatorRelation.findFirst({
      orderBy: { validFrom: 'desc' },
      select: {
        operator: {
          select: {
            id: true,
            realName: true,
            user: { select: { id: true, status: true } },
          },
        },
      },
      where: {
        hostId: appointment.host.id,
        operator: { employmentStatus: 'ACTIVE', siteId: appointment.siteId },
        validFrom: { lte: appointment.appointmentDate },
        OR: [{ validUntil: null }, { validUntil: { gt: appointment.appointmentDate } }],
      },
    });
    if (relation) {
      recipients.push({
        name: relation.operator.realName,
        profileId: relation.operator.id,
        roleCode: 'OPERATOR',
        userId: relation.operator.user?.id ?? null,
        userStatus: relation.operator.user?.status ?? null,
      });
    }
    return recipients;
  }

  private artistRecipient(appointment: AppointmentRecord): Recipient {
    return {
      name: appointment.artist.nickname,
      profileId: appointment.artist.id,
      roleCode: 'ARTIST',
      userId: appointment.artist.user?.id ?? null,
      userStatus: appointment.artist.user?.status ?? null,
    };
  }

  private taskPayload(appointment: AppointmentRecord): Prisma.InputJsonObject {
    return {
      appointmentDate: formatDateOnly(appointment.appointmentDate),
      appointmentId: appointment.id,
      artistName: appointment.artistNicknameSnapshot,
      durationMinutes: appointment.durationMinutes,
      endAt: appointment.endAt.toISOString(),
      hostCode: appointment.hostCodeSnapshot,
      hostName: appointment.hostNameSnapshot,
      siteName: appointment.siteNameSnapshot,
      startAt: appointment.startAt.toISOString(),
    };
  }
}
