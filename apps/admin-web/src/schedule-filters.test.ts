import { describe, expect, it } from 'vitest';

import type { ScheduleArtist } from './schedule-board-api';
import { filterScheduleArtists } from './schedule-filters';

const artists = [
  {
    appointments: [
      {
        appointmentType: 'FIXED',
        dailySequence: 1,
        durationMinutes: 30,
        endAt: '2026-07-23T02:00:00.000Z',
        endMinute: 600,
        hostCode: 'ZB01001',
        hostId: 'host-1',
        hostName: '小雨',
        id: 'appointment-1',
        operatorId: 'operator-1',
        operatorName: '运营甲',
        rowVersion: 1,
        startAt: '2026-07-23T01:30:00.000Z',
        startMinute: 570,
        status: 'BOOKED',
      },
      {
        appointmentType: 'SINGLE',
        dailySequence: 2,
        durationMinutes: 45,
        endAt: '2026-07-23T03:00:00.000Z',
        endMinute: 660,
        hostCode: 'ZB01002',
        hostId: 'host-2',
        hostName: '圆圆',
        id: 'appointment-2',
        operatorId: null,
        operatorName: null,
        rowVersion: 1,
        startAt: '2026-07-23T02:15:00.000Z',
        startMinute: 615,
        status: 'COMPLETED',
      },
    ],
    artistId: 'artist-1',
    artistNickname: '柔柔',
    availabilitySource: 'REGULAR_SHIFT',
    available: true,
    breakInterval: null,
    unavailableReason: null,
    workIntervals: [{ endMinute: 1020, startMinute: 540 }],
  },
] satisfies readonly ScheduleArtist[];

describe('schedule filters', () => {
  it('matches host code and combines type and status filters', () => {
    expect(
      filterScheduleArtists(artists, {
        appointmentType: 'FIXED',
        artistId: '',
        query: 'zb01001',
        status: 'BOOKED',
      })[0]?.appointments.map((appointment) => appointment.id),
    ).toEqual(['appointment-1']);
  });

  it('keeps every matching appointment when the query matches the artist', () => {
    expect(
      filterScheduleArtists(artists, {
        appointmentType: 'ALL',
        artistId: '',
        query: '柔柔',
        status: 'ALL',
      })[0]?.appointments,
    ).toHaveLength(2);
  });

  it('removes rows with no matching appointments', () => {
    expect(
      filterScheduleArtists(artists, {
        appointmentType: 'ALL',
        artistId: '',
        query: '不存在',
        status: 'ALL',
      }),
    ).toEqual([]);
  });
});
