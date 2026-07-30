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
