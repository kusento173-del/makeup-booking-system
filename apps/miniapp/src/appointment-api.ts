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
  readonly toDate: string;
  readonly token: string;
}): Promise<AppointmentPage> {
  const query = `fromDate=${input.fromDate}&toDate=${input.toDate}&page=1&pageSize=100`;
  return apiRequest(`/appointments?${query}`, { token: input.token });
}

export function cancelAppointment(input: {
  readonly appointmentId: string;
  readonly expectedRowVersion: number;
  readonly token: string;
}): Promise<{ readonly status: 'CANCELLED' }> {
  return apiRequest(`/appointments/${input.appointmentId}/cancel`, {
    body: { expectedRowVersion: input.expectedRowVersion },
    method: 'POST',
    token: input.token,
  });
}
