import { Prisma } from '@makeup/database';
import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../database/database.service';
import {
  APPOINTMENT_NOTIFICATION_SELECT,
  appointmentNotificationPayload,
} from './appointment-notification';
import type { NotificationChannel, NotificationReminderBatchResult } from './notification.types';

const REMINDER_ADVANCE_MS = 60 * 60_000;

@Injectable()
export class NotificationScheduleService {
  constructor(private readonly database: DatabaseService) {}

  async runReminderBatch(
    channel: NotificationChannel,
    limit = 100,
    now = new Date(),
  ): Promise<NotificationReminderBatchResult> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw new Error('Notification reminder batch limit is invalid');
    }
    return this.database.transaction(async (transaction) => {
      const cancelled = await transaction.notificationTask.updateMany({
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
      const template = await transaction.notificationTemplateVersion.findFirst({
        orderBy: { version: 'desc' },
        select: { id: true },
        where: {
          channel,
          recipientRoleCode: 'HOST',
          status: 'ACTIVE',
          templateCode: 'APPOINTMENT_REMINDER',
        },
      });
      if (!template) {
        return {
          cancelledTaskCount: cancelled.count,
          createdTaskCount: 0,
          templateAvailable: false,
        };
      }
      const appointments = await transaction.appointment.findMany({
        orderBy: [{ startAt: 'asc' }, { id: 'asc' }],
        select: APPOINTMENT_NOTIFICATION_SELECT,
        take: limit,
        where: {
          host: { user: { is: { status: 'ACTIVE' } } },
          notificationTasks: {
            none: {
              recipientRoleCode: 'HOST',
              templateVersion: { templateCode: 'APPOINTMENT_REMINDER' },
            },
          },
          startAt: { gt: now },
          status: 'BOOKED',
        },
      });
      const tasks = appointments.map((appointment) => {
        const recipientUserId = appointment.host.user?.id;
        if (!recipientUserId) throw new Error('Reminder appointment host account is unavailable');
        return {
          appointmentId: appointment.id,
          businessKey: `APPOINTMENT_REMINDER:${appointment.id}:HOST:${appointment.host.id}`,
          payload: appointmentNotificationPayload(
            appointment,
            '即将开始',
            '请提前到场并确认化妆安排',
          ),
          recipientNameSnapshot: appointment.host.nickname ?? appointment.host.realName,
          recipientProfileId: appointment.host.id,
          recipientRoleCode: 'HOST',
          recipientUserId,
          scheduledAt: new Date(appointment.startAt.getTime() - REMINDER_ADVANCE_MS),
          siteId: appointment.siteId,
          templateVersionId: template.id,
        } satisfies Prisma.NotificationTaskCreateManyInput;
      });
      const created =
        tasks.length > 0
          ? await transaction.notificationTask.createMany({ data: tasks, skipDuplicates: true })
          : { count: 0 };
      return {
        cancelledTaskCount: cancelled.count,
        createdTaskCount: created.count,
        templateAvailable: true,
      };
    });
  }
}
