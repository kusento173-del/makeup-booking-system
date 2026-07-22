export type AppointmentDisplayStatus = 'BOOKED' | 'CANCELLED' | 'COMPLETED';

export interface AppointmentListInput {
  readonly fromDate: Date;
  readonly page: number;
  readonly pageSize: number;
  readonly status?: AppointmentDisplayStatus;
  readonly toDate: Date;
}

export interface AppointmentListItem {
  readonly appointmentType: 'SINGLE';
  readonly artistId: string;
  readonly artistNickname: string;
  readonly dailySequence: 1 | 2;
  readonly date: string;
  readonly durationMinutes: number;
  readonly endAt: string;
  readonly hostCode: string;
  readonly hostId: string;
  readonly hostName: string;
  readonly id: string;
  readonly operatorId: string | null;
  readonly operatorName: string | null;
  readonly rescheduledFromAppointmentId: string | null;
  readonly rowVersion: number;
  readonly siteId: string;
  readonly siteName: string;
  readonly startAt: string;
  readonly status: AppointmentDisplayStatus;
}

export interface AppointmentPage {
  readonly items: readonly AppointmentListItem[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
}
