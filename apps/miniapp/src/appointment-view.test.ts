import { describe, expect, it } from 'vitest';

import type { AppointmentListItem } from './appointment-api';
import {
  appointmentSubject,
  appointmentTime,
  scheduleDateRange,
  STATUS_LABELS,
} from './appointment-view';

const appointment: AppointmentListItem = {
  appointmentType: 'FIXED',
  artistNickname: '柔柔',
  dailySequence: 1,
  date: '2026-07-24',
  durationMinutes: 30,
  endAt: '2026-07-24T02:00:00.000Z',
  hostCode: 'ZB01842',
  hostName: '小雨',
  id: 'appointment-1',
  siteName: '松江',
  startAt: '2026-07-24T01:30:00.000Z',
  status: 'BOOKED',
};

describe('appointment view', () => {
  it('按上海业务日期生成四种查询范围', () => {
    const now = new Date('2026-07-23T16:30:00.000Z');
    expect(scheduleDateRange('TODAY', now)).toEqual({
      fromDate: '2026-07-24',
      toDate: '2026-07-24',
    });
    expect(scheduleDateRange('SEVEN_DAYS', now)).toEqual({
      fromDate: '2026-07-25',
      toDate: '2026-07-31',
    });
    expect(scheduleDateRange('HISTORY', now)).toEqual({
      fromDate: '2026-06-24',
      toDate: '2026-07-23',
    });
    expect(scheduleDateRange('HISTORY', now, 1)).toEqual({
      fromDate: '2026-05-25',
      toDate: '2026-06-23',
    });
  });

  it('按当前角色展示主要预约对象', () => {
    expect(appointmentSubject(appointment, 'HOST')).toBe('柔柔');
    expect(appointmentSubject(appointment, 'ARTIST')).toBe('小雨 · ZB01842');
    expect(appointmentSubject(appointment, 'OPERATOR')).toBe('小雨 · 柔柔');
  });

  it('展示上海时间和统一状态文案', () => {
    expect(appointmentTime(appointment)).toBe('09:30–10:00');
    expect(STATUS_LABELS.BOOKED).toBe('已预约');
  });
});
