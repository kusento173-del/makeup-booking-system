import type { Prisma } from '@makeup/database';

import { formatDateOnly, instantToBusinessDateMinute } from '../shift/business-date';

export const APPOINTMENT_NOTIFICATION_SELECT = {
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

export type AppointmentNotificationRecord = Prisma.AppointmentGetPayload<{
  select: typeof APPOINTMENT_NOTIFICATION_SELECT;
}>;

export function appointmentNotificationPayload(
  appointment: AppointmentNotificationRecord,
  appointmentStatus: string,
  noticeText: string,
): Prisma.InputJsonObject {
  const appointmentDate = formatDateOnly(appointment.appointmentDate);
  const startTime = clock(
    instantToBusinessDateMinute(appointment.appointmentDate, appointment.startAt),
  );
  const endTime = clock(
    instantToBusinessDateMinute(appointment.appointmentDate, appointment.endAt),
  );
  return {
    appointmentCount: 1,
    appointmentDate,
    appointmentDateTime: `${appointmentDate} ${startTime}`,
    appointmentId: appointment.id,
    appointmentStatus,
    artistName: appointment.artistNicknameSnapshot,
    durationMinutes: appointment.durationMinutes,
    endAt: appointment.endAt.toISOString(),
    endTime,
    hostCode: appointment.hostCodeSnapshot,
    hostName: appointment.hostNameSnapshot,
    noticeText,
    siteName: appointment.siteNameSnapshot,
    startAt: appointment.startAt.toISOString(),
    startTime,
    timeRange: `${startTime}~${endTime}`,
  };
}

function clock(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}
