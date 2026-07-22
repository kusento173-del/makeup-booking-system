import type { DatabaseClient } from '@makeup/database';
import { describe, expect, it, vi } from 'vitest';

import {
  AuthorizationDeniedError,
  AuthorizationPolicyService,
} from '../auth/authorization-policy.service';
import type { DatabaseService } from '../database/database.service';
import { ScheduleDateOutOfRangeError, ScheduleSiteRequiredError } from './schedule-board.errors';
import { ScheduleBoardService } from './schedule-board.service';

const date = new Date('2026-07-22T00:00:00.000Z');
const now = new Date('2026-07-22T02:00:00.000Z');
const context = {
  roleAssignmentId: 'role-1',
  roleCode: 'CUSTOMER_SERVICE' as const,
  siteId: 'site-1',
  userId: 'customer-user-1',
};
const shift = {
  breakEndMinute: 780,
  breakStartMinute: 720,
  workEndMinute: 1020,
  workStartMinute: 540,
  workdays: [1, 2, 3, 4, 5],
};
const artists = [
  {
    employmentStatus: 'ACTIVE',
    id: 'artist-1',
    leaveRecords: [],
    nickname: '柔柔',
    overtimes: [],
    shiftTemplates: [shift],
  },
  {
    employmentStatus: 'ACTIVE',
    id: 'artist-2',
    leaveRecords: [{ id: 'leave-1' }],
    nickname: '江江',
    overtimes: [],
    shiftTemplates: [shift],
  },
];
const appointments = [
  {
    appointmentType: 'FIXED',
    artistId: 'artist-1',
    dailySequence: 1,
    durationMinutes: 30,
    endAt: new Date('2026-07-22T01:30:00.000Z'),
    hostCodeSnapshot: 'ZB01001',
    hostId: 'host-1',
    hostNameSnapshot: '小雨',
    id: 'appointment-1',
    operatorIdAtBooking: 'operator-1',
    operatorNameSnapshot: '运营甲',
    rowVersion: 1,
    startAt: new Date('2026-07-22T01:00:00.000Z'),
    status: 'BOOKED',
  },
];

function createService(options?: { siteStatus?: string }) {
  const client = {
    appointment: { findMany: vi.fn().mockResolvedValue(appointments) },
    artistProfile: { findMany: vi.fn().mockResolvedValue(artists) },
    site: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'site-1',
        name: '松江场地',
        status: options?.siteStatus ?? 'ACTIVE',
      }),
    },
  };
  const database = {
    read: vi.fn((operation: (value: DatabaseClient) => unknown) =>
      operation(client as unknown as DatabaseClient),
    ),
  };
  return {
    client,
    service: new ScheduleBoardService(
      new AuthorizationPolicyService(),
      database as unknown as DatabaseService,
    ),
  };
}

describe('ScheduleBoardService', () => {
  it('returns ordered artist work intervals and active appointments from one board query', async () => {
    const { client, service } = createService();

    await expect(service.get(context, { date }, now)).resolves.toEqual({
      artists: [
        {
          appointments: [
            {
              appointmentType: 'FIXED',
              dailySequence: 1,
              durationMinutes: 30,
              endAt: '2026-07-22T01:30:00.000Z',
              endMinute: 570,
              hostCode: 'ZB01001',
              hostId: 'host-1',
              hostName: '小雨',
              id: 'appointment-1',
              operatorId: 'operator-1',
              operatorName: '运营甲',
              rowVersion: 1,
              startAt: '2026-07-22T01:00:00.000Z',
              startMinute: 540,
              status: 'COMPLETED',
            },
          ],
          artistId: 'artist-1',
          artistNickname: '柔柔',
          availabilitySource: 'REGULAR_SHIFT',
          available: true,
          breakInterval: { endMinute: 780, startMinute: 720 },
          unavailableReason: null,
          workIntervals: [
            { endMinute: 720, startMinute: 540 },
            { endMinute: 1020, startMinute: 780 },
          ],
        },
        {
          appointments: [],
          artistId: 'artist-2',
          artistNickname: '江江',
          availabilitySource: null,
          available: false,
          breakInterval: null,
          unavailableReason: 'ARTIST_ON_LEAVE',
          workIntervals: [],
        },
      ],
      date: '2026-07-22',
      lastUpdatedAt: '2026-07-22T02:00:00.000Z',
      siteId: 'site-1',
      siteName: '松江场地',
    });
    expect(client.appointment.findMany.mock.calls[0]?.[0]).toMatchObject({
      where: {
        appointmentDate: date,
        siteId: 'site-1',
        status: { in: ['BOOKED', 'COMPLETED'] },
      },
    });
    expect(client.artistProfile.findMany.mock.calls[0]?.[0]).toMatchObject({
      orderBy: [{ nickname: 'asc' }, { id: 'asc' }],
      where: { siteId: 'site-1' },
    });
  });

  it('enforces customer-service site scope and requires administrators to select a site', () => {
    const { service } = createService();
    expect(() => service.get(context, { date, siteId: 'site-2' }, now)).toThrow(
      AuthorizationDeniedError,
    );
    expect(() =>
      service.get({ ...context, roleCode: 'ADMIN', siteId: null }, { date }, now),
    ).toThrow(ScheduleSiteRequiredError);
  });

  it('marks every artist unavailable when the site is inactive', async () => {
    const { service } = createService({ siteStatus: 'INACTIVE' });
    await expect(service.get(context, { date }, now)).resolves.toMatchObject({
      artists: [{ unavailableReason: 'SITE_INACTIVE' }, { unavailableReason: 'SITE_INACTIVE' }],
    });
  });

  it('allows arbitrary history but limits future boards to the next seven days', () => {
    const { service } = createService();
    expect(() => service.get(context, { date: new Date('2026-07-30T00:00:00.000Z') }, now)).toThrow(
      ScheduleDateOutOfRangeError,
    );
  });
});
