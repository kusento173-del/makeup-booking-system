import type { Prisma } from '@makeup/database';
import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../database/database.service';
import {
  businessDateMinuteToInstant,
  formatDateOnly,
  toBusinessDate,
} from '../shift/business-date';
import {
  APPOINTMENT_NOTIFICATION_SELECT,
  appointmentNotificationPayload,
} from './appointment-notification';
import type {
  NotificationChannel,
  NotificationDailySummaryBatchResult,
  NotificationReminderBatchResult,
} from './notification.types';

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

  async runDailySummary(
    channel: NotificationChannel,
    now = new Date(),
  ): Promise<NotificationDailySummaryBatchResult> {
    const appointmentDate = toBusinessDate(now);
    if (now < businessDateMinuteToInstant(appointmentDate, 1)) {
      return { createdTaskCount: 0, eligible: false, missingTemplateRoles: [] };
    }
    return this.database.transaction(async (transaction) => {
      const templates = await transaction.notificationTemplateVersion.findMany({
        orderBy: { version: 'desc' },
        select: { id: true, recipientRoleCode: true },
        where: {
          channel,
          recipientRoleCode: { in: ['ARTIST', 'OPERATOR'] },
          status: 'ACTIVE',
          templateCode: 'DAILY_SCHEDULE_SUMMARY',
        },
      });
      const templateByRole = new Map(
        templates.map((template) => [template.recipientRoleCode, template.id]),
      );
      const missingTemplateRoles = (['ARTIST', 'OPERATOR'] as const).filter(
        (role) => !templateByRole.has(role),
      );
      const date = formatDateOnly(appointmentDate);
      const existing = await transaction.notificationTask.findMany({
        select: { recipientProfileId: true, recipientRoleCode: true },
        where: {
          businessKey: { startsWith: `DAILY_SCHEDULE:${date}:` },
          templateVersion: { templateCode: 'DAILY_SCHEDULE_SUMMARY' },
        },
      });
      const existingScopes = new Set(
        existing.map((task) => `${task.recipientRoleCode}:${task.recipientProfileId}`),
      );
      const [artists, operators, appointments, relations] = await Promise.all([
        templateByRole.has('ARTIST')
          ? transaction.artistProfile.findMany({
              orderBy: { id: 'asc' },
              select: {
                id: true,
                nickname: true,
                site: { select: { name: true } },
                siteId: true,
                user: { select: { id: true, status: true } },
              },
              where: { employmentStatus: 'ACTIVE', site: { status: 'ACTIVE' } },
            })
          : [],
        templateByRole.has('OPERATOR')
          ? transaction.operatorProfile.findMany({
              orderBy: { id: 'asc' },
              select: {
                id: true,
                realName: true,
                site: { select: { name: true } },
                siteId: true,
                user: { select: { id: true, status: true } },
              },
              where: { employmentStatus: 'ACTIVE', site: { status: 'ACTIVE' } },
            })
          : [],
        transaction.appointment.findMany({
          select: { artistId: true, hostId: true },
          where: {
            appointmentDate,
            status: { in: ['BOOKED', 'COMPLETED'] },
          },
        }),
        templateByRole.has('OPERATOR')
          ? transaction.hostOperatorRelation.findMany({
              select: { hostId: true, operatorId: true },
              where: {
                host: { qualificationStatus: 'ACTIVE' },
                operator: { employmentStatus: 'ACTIVE', site: { status: 'ACTIVE' } },
                validFrom: { lte: appointmentDate },
                OR: [{ validUntil: null }, { validUntil: { gt: appointmentDate } }],
              },
            })
          : [],
      ]);
      const artistAppointments = new Map<string, { count: number; hosts: Set<string> }>();
      const hostAppointmentCounts = new Map<string, number>();
      for (const appointment of appointments) {
        const artist = artistAppointments.get(appointment.artistId) ?? {
          count: 0,
          hosts: new Set<string>(),
        };
        artist.count += 1;
        artist.hosts.add(appointment.hostId);
        artistAppointments.set(appointment.artistId, artist);
        hostAppointmentCounts.set(
          appointment.hostId,
          (hostAppointmentCounts.get(appointment.hostId) ?? 0) + 1,
        );
      }
      const operatorHosts = new Map<string, Set<string>>();
      for (const relation of relations) {
        const hosts = operatorHosts.get(relation.operatorId) ?? new Set<string>();
        hosts.add(relation.hostId);
        operatorHosts.set(relation.operatorId, hosts);
      }
      const data: Prisma.NotificationTaskCreateManyInput[] = [];
      const artistTemplateId = templateByRole.get('ARTIST');
      if (artistTemplateId) {
        for (const artist of artists) {
          if (existingScopes.has(`ARTIST:${artist.id}`)) continue;
          const summary = artistAppointments.get(artist.id);
          const appointmentCount = summary?.count ?? 0;
          data.push(
            this.summaryTask({
              appointmentCount,
              appointmentDate: date,
              bookedHostCount: summary?.hosts.size ?? 0,
              hostCount: summary?.hosts.size ?? 0,
              name: artist.nickname,
              noticeText: '请进入小程序查看今日完整排班',
              now,
              profileId: artist.id,
              roleCode: 'ARTIST',
              siteId: artist.siteId,
              siteName: artist.site.name,
              templateVersionId: artistTemplateId,
              unbookedHostCount: 0,
              user: artist.user,
            }),
          );
        }
      }
      const operatorTemplateId = templateByRole.get('OPERATOR');
      if (operatorTemplateId) {
        for (const operator of operators) {
          if (existingScopes.has(`OPERATOR:${operator.id}`)) continue;
          const hosts = operatorHosts.get(operator.id) ?? new Set<string>();
          let appointmentCount = 0;
          let bookedHostCount = 0;
          for (const hostId of hosts) {
            const count = hostAppointmentCounts.get(hostId) ?? 0;
            appointmentCount += count;
            if (count > 0) bookedHostCount += 1;
          }
          data.push(
            this.summaryTask({
              appointmentCount,
              appointmentDate: date,
              bookedHostCount,
              hostCount: hosts.size,
              name: operator.realName,
              noticeText: '包含未预约主播，请查看完整清单',
              now,
              profileId: operator.id,
              roleCode: 'OPERATOR',
              siteId: operator.siteId,
              siteName: operator.site.name,
              templateVersionId: operatorTemplateId,
              unbookedHostCount: hosts.size - bookedHostCount,
              user: operator.user,
            }),
          );
        }
      }
      const created =
        data.length > 0
          ? await transaction.notificationTask.createMany({ data, skipDuplicates: true })
          : { count: 0 };
      return {
        createdTaskCount: created.count,
        eligible: true,
        missingTemplateRoles,
      };
    });
  }

  private summaryTask(input: {
    readonly appointmentCount: number;
    readonly appointmentDate: string;
    readonly bookedHostCount: number;
    readonly hostCount: number;
    readonly name: string;
    readonly noticeText: string;
    readonly now: Date;
    readonly profileId: string;
    readonly roleCode: 'ARTIST' | 'OPERATOR';
    readonly siteId: string;
    readonly siteName: string;
    readonly templateVersionId: string;
    readonly unbookedHostCount: number;
    readonly user: { readonly id: string; readonly status: string } | null;
  }): Prisma.NotificationTaskCreateManyInput {
    const available = input.user?.status === 'ACTIVE';
    return {
      businessKey: `DAILY_SCHEDULE:${input.appointmentDate}:${input.roleCode}:${input.profileId}`,
      ...(available
        ? { recipientUserId: input.user.id }
        : {
            failedAt: input.now,
            lastErrorCode: input.user ? 'RECIPIENT_ACCOUNT_UNAVAILABLE' : 'RECIPIENT_UNBOUND',
            lastErrorSummary: input.user ? '接收人账号当前不可用' : '接收人尚未绑定微信账号',
            ...(input.user ? { recipientUserId: input.user.id } : {}),
            status: 'FAILED',
          }),
      payload: {
        appointmentCount: input.appointmentCount,
        appointmentDate: input.appointmentDate,
        bookedHostCount: input.bookedHostCount,
        hostCount: input.hostCount,
        noticeText: input.noticeText,
        scheduleStatus: input.appointmentCount > 0 ? '今日有预约' : '今日无预约',
        siteName: input.siteName,
        unbookedHostCount: input.unbookedHostCount,
      },
      recipientNameSnapshot: input.name,
      recipientProfileId: input.profileId,
      recipientRoleCode: input.roleCode,
      scheduledAt: input.now,
      siteId: input.siteId,
      templateVersionId: input.templateVersionId,
    };
  }
}
