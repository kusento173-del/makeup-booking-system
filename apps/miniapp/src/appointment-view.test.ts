import { describe, expect, it } from 'vitest';

import type { AppointmentListItem } from './appointment-api';
import {
  appointmentSubject,
  appointmentTime,
  canCancelAppointment,
  parseRescheduleContext,
  rescheduleRoute,
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
  hostId: 'host-1',
  hostName: '小雨',
  id: 'appointment-1',
  rowVersion: 1,
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

  it('只允许主播和运营取消明日以后仍为已预约的排班', () => {
    const now = new Date('2026-07-23T16:30:00.000Z');
    expect(canCancelAppointment(appointment, 'HOST', now)).toBe(false);
    expect(canCancelAppointment({ ...appointment, date: '2026-07-25' }, 'OPERATOR', now)).toBe(
      true,
    );
    expect(canCancelAppointment({ ...appointment, date: '2026-07-25' }, 'ARTIST', now)).toBe(false);
    expect(
      canCancelAppointment(
        { ...appointment, date: '2026-07-25', status: 'COMPLETED' },
        'HOST',
        now,
      ),
    ).toBe(false);
  });

  it('生成并解析完整的改期上下文', () => {
    const route = rescheduleRoute(appointment);
    const query = Object.fromEntries(new URLSearchParams(route.split('?')[1]));
    expect(parseRescheduleContext(query)).toMatchObject({
      appointmentId: 'appointment-1',
      hostId: 'host-1',
      rowVersion: 1,
      timeLabel: '09:30–10:00',
    });
    expect(parseRescheduleContext({ appointmentId: 'appointment-1' })).toBeNull();
    expect(parseRescheduleContext({ ...query, timeLabel: 'invalid' })).toBeNull();
  });

  it('解析微信路由保留的百分号编码参数', () => {
    const route = rescheduleRoute(appointment);
    const encodedQuery = Object.fromEntries(
      route
        .split('?')[1]!
        .split('&')
        .map((part) => {
          const [key, value] = part.split('=');
          return [key!, value!];
        }),
    );

    expect(parseRescheduleContext(encodedQuery)).toMatchObject({
      artistNickname: '柔柔',
      hostName: '小雨',
      timeLabel: '09:30–10:00',
    });
  });

  it('忽略微信路由附加的非字符串参数', () => {
    expect(parseRescheduleContext({ $taroTimestamp: Date.now() })).toBeNull();
    expect(
      parseRescheduleContext({
        appointmentId: ['invalid'],
        $taroTimestamp: Date.now(),
      }),
    ).toBeNull();
  });
});
