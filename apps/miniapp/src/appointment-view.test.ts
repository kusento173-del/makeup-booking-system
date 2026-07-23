import { describe, expect, it } from 'vitest';

import type { AppointmentListItem } from './appointment-api';
import {
  appointmentSubject,
  appointmentTime,
  canChangeAppointment,
  scheduleDateRange,
} from './appointment-view';

const APPOINTMENT: AppointmentListItem = {
  appointmentType: 'SINGLE',
  artistNickname: '柔柔',
  dailySequence: 1,
  date: '2026-07-24',
  durationMinutes: 30,
  endAt: '2026-07-24T02:00:00.000Z',
  hostCode: 'ZB001',
  hostId: 'host-1',
  hostName: '小雨',
  id: 'appointment-1',
  rowVersion: 1,
  siteName: '松江',
  startAt: '2026-07-24T01:30:00.000Z',
  status: 'BOOKED',
};

describe('appointment view', () => {
  it('按上海业务日期生成查询范围', () => {
    const now = new Date('2026-07-23T15:30:00.000Z');
    expect(scheduleDateRange('TODAY', now)).toEqual({
      fromDate: '2026-07-23',
      toDate: '2026-07-23',
    });
    expect(scheduleDateRange('TOMORROW', now)).toEqual({
      fromDate: '2026-07-24',
      toDate: '2026-07-24',
    });
    expect(scheduleDateRange('SEVEN_DAYS', now)).toEqual({
      fromDate: '2026-07-24',
      toDate: '2026-07-30',
    });
  });

  it('按角色突出最重要的排班对象', () => {
    expect(appointmentSubject(APPOINTMENT, 'HOST')).toBe('柔柔');
    expect(appointmentSubject(APPOINTMENT, 'ARTIST')).toBe('小雨 · ZB001');
    expect(appointmentSubject(APPOINTMENT, 'OPERATOR')).toBe('小雨 · 柔柔');
    expect(appointmentTime(APPOINTMENT)).toBe('09:30–10:00');
  });

  it('只允许修改明日以后仍有效的预约', () => {
    const now = new Date('2026-07-23T02:00:00.000Z');
    expect(canChangeAppointment(APPOINTMENT, now)).toBe(true);
    expect(canChangeAppointment({ ...APPOINTMENT, date: '2026-07-23' }, now)).toBe(false);
    expect(canChangeAppointment({ ...APPOINTMENT, status: 'CANCELLED' }, now)).toBe(false);
  });
});
