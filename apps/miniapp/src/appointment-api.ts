import { apiRequest } from './api-client';

export type AppointmentStatus = 'BOOKED' | 'CANCELLED' | 'COMPLETED';

export interface AppointmentListItem {
  readonly appointmentType: 'FIXED' | 'SINGLE';
  readonly artistNickname: string;
  readonly dailySequence: 1 | 2;
  readonly date: string;
  readonly durationMinutes: number;
  readonly endAt: string;
  readonly hostCode: string;
  readonly hostId: string;
  readonly hostName: string;
  readonly id: string;
  readonly rowVersion: number;
  readonly siteName: string;
  readonly startAt: string;
  readonly status: AppointmentStatus;
}

export interface AppointmentPage {
  readonly items: readonly AppointmentListItem[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
}

export function listAppointments(input: {
  readonly fromDate: string;
  readonly page: number;
  readonly pageSize?: number;
  readonly toDate: string;
  readonly token: string;
}): Promise<AppointmentPage> {
  const query = new URLSearchParams({
    fromDate: input.fromDate,
    page: String(input.page),
    pageSize: String(input.pageSize ?? 50),
    toDate: input.toDate,
  });
  return apiRequest(`/appointments?${query.toString()}`, { token: input.token });
}

export function cancelAppointment(
  token: string,
  appointmentId: string,
  expectedRowVersion: number,
): Promise<{
  readonly cancelledAt: string;
  readonly id: string;
  readonly rowVersion: number;
  readonly status: 'CANCELLED';
}> {
  return apiRequest(`/appointments/${appointmentId}/cancel`, {
    body: { expectedRowVersion },
    method: 'POST',
    token,
  });
}
