import type { DatabaseClient, Prisma } from '@makeup/database';

export const AFFECTED_APPOINTMENT_SELECT = {
  appointmentDate: true,
  appointmentType: true,
  endAt: true,
  hostCodeSnapshot: true,
  hostId: true,
  hostNameSnapshot: true,
  id: true,
  startAt: true,
} satisfies Prisma.AppointmentSelect;

export type AffectedAppointmentRecord = Prisma.AppointmentGetPayload<{
  select: typeof AFFECTED_APPOINTMENT_SELECT;
}>;

export interface AffectedAppointmentSummary {
  readonly appointmentDate: string;
  readonly appointmentType: 'FIXED' | 'SINGLE';
  readonly endAt: string;
  readonly hostCode: string;
  readonly hostId: string;
  readonly hostName: string;
  readonly id: string;
  readonly startAt: string;
}

export async function findAffectedAppointments(
  client: DatabaseClient | Prisma.TransactionClient,
  where: Prisma.AppointmentWhereInput,
): Promise<readonly AffectedAppointmentRecord[]> {
  return client.appointment.findMany({
    orderBy: [{ appointmentDate: 'asc' }, { startAt: 'asc' }],
    select: AFFECTED_APPOINTMENT_SELECT,
    where,
  });
}

export function toAffectedAppointment(
  appointment: AffectedAppointmentRecord,
): AffectedAppointmentSummary {
  return {
    appointmentDate: appointment.appointmentDate.toISOString().slice(0, 10),
    appointmentType: appointment.appointmentType as 'FIXED' | 'SINGLE',
    endAt: appointment.endAt.toISOString(),
    hostCode: appointment.hostCodeSnapshot,
    hostId: appointment.hostId,
    hostName: appointment.hostNameSnapshot,
    id: appointment.id,
    startAt: appointment.startAt.toISOString(),
  };
}

export function affectedAppointmentSnapshot(
  appointments: readonly AffectedAppointmentRecord[],
): Prisma.InputJsonValue {
  return appointments.map((appointment) => {
    const summary = toAffectedAppointment(appointment);
    return {
      appointmentDate: summary.appointmentDate,
      appointmentType: summary.appointmentType,
      endAt: summary.endAt,
      hostCode: summary.hostCode,
      hostId: summary.hostId,
      hostName: summary.hostName,
      id: summary.id,
      startAt: summary.startAt,
    } satisfies Prisma.InputJsonObject;
  });
}

export function parseAffectedAppointmentSnapshot(
  value: Prisma.JsonValue | null,
): readonly AffectedAppointmentSummary[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const appointment = item;
    if (
      typeof appointment.appointmentDate !== 'string' ||
      typeof appointment.appointmentType !== 'string' ||
      !['FIXED', 'SINGLE'].includes(appointment.appointmentType) ||
      typeof appointment.endAt !== 'string' ||
      typeof appointment.hostCode !== 'string' ||
      typeof appointment.hostId !== 'string' ||
      typeof appointment.hostName !== 'string' ||
      typeof appointment.id !== 'string' ||
      typeof appointment.startAt !== 'string'
    ) {
      return [];
    }
    return [
      {
        appointmentDate: appointment.appointmentDate,
        appointmentType: appointment.appointmentType as 'FIXED' | 'SINGLE',
        endAt: appointment.endAt,
        hostCode: appointment.hostCode,
        hostId: appointment.hostId,
        hostName: appointment.hostName,
        id: appointment.id,
        startAt: appointment.startAt,
      },
    ];
  });
}
