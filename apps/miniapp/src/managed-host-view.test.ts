import { describe, expect, it } from 'vitest';

import type { ManagedHostSummary } from './fixed-api';
import {
  managedHostActionRoute,
  managedHostBookingLabel,
  currentBusinessDate,
  managedHostDetailDates,
  managedHostFixedLabel,
  managedHostPendingLabel,
  toBookingHost,
} from './managed-host-view';

const host: ManagedHostSummary = {
  activeRule: {
    artistId: 'artist-1',
    artistNickname: '柔柔',
    durationMinutes: 30,
    id: 'rule-1',
    rowVersion: 1,
    startMinute: 540,
    validFrom: '2026-07-26',
    weekdays: [1, 3],
  },
  bookingAvailability: 'AVAILABLE',
  hostCode: '000001',
  hostId: 'host-1',
  hostName: '阿伟',
  pendingRequest: null,
  qualificationStatus: 'ACTIVE',
  siteId: 'site-1',
  siteName: '松江',
};

describe('managed host view', () => {
  it('形成清晰的预约和固定状态文案', () => {
    expect(managedHostBookingLabel('ON_LEAVE')).toBe('当日请假');
    expect(managedHostFixedLabel(host, new Date('2026-07-24T04:00:00.000Z'))).toBe(
      '固定（2026-07-26 起）：柔柔 · 周一、周三 · 09:00–09:30',
    );
    expect(
      managedHostPendingLabel({
        effectiveFrom: '2026-07-28',
        id: 'request-1',
        requestType: 'CHANGE',
        rowVersion: 1,
        targetArtistId: 'artist-1',
        targetDurationMinutes: 30,
        targetStartMinute: 600,
        targetWeekdays: [2],
      }),
    ).toBe('待审核：变更固定 · 2026-07-28 生效');
  });

  it('保留主播和目标日期跳转业务页', () => {
    expect(managedHostActionRoute('booking', 'host-1', '2026-07-27')).toBe(
      '/pages/booking/index?hostId=host-1&date=2026-07-27',
    );
    expect(toBookingHost(host)).toMatchObject({
      hostCode: '000001',
      id: 'host-1',
      nickname: '阿伟',
      siteId: 'site-1',
    });
    expect(managedHostActionRoute('managed-host-detail', 'host-1', '2026-07-27')).toBe(
      '/pages/managed-host-detail/index?hostId=host-1&date=2026-07-27',
    );
    expect(
      managedHostDetailDates(new Date('2026-07-23T16:30:00.000Z')).map((item) => item.date),
    ).toEqual([
      '2026-07-24',
      '2026-07-25',
      '2026-07-26',
      '2026-07-27',
      '2026-07-28',
      '2026-07-29',
      '2026-07-30',
      '2026-07-31',
    ]);
  });

  it('使用上海业务日确定当前负责关系', () => {
    expect(currentBusinessDate(new Date('2026-07-23T16:30:00.000Z'))).toBe('2026-07-24');
  });
});
