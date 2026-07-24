import type { HostSummary } from './booking-api';
import type {
  ManagedHostBookingAvailability,
  ManagedHostSummary,
  PendingFixedRequest,
} from './fixed-api';
import { fixedTimeLabel, requestTypeLabel, weekdayLabel } from './fixed-view';

const BUSINESS_DATE = new Intl.DateTimeFormat('en-CA', {
  day: '2-digit',
  month: '2-digit',
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
});
const DETAIL_DATE_LABEL = new Intl.DateTimeFormat('zh-CN', {
  day: 'numeric',
  month: 'numeric',
  timeZone: 'Asia/Shanghai',
  weekday: 'short',
});

export function managedHostBookingLabel(availability: ManagedHostBookingAvailability): string {
  return {
    AVAILABLE: '可预约',
    ON_LEAVE: '当日请假',
    QUALIFICATION_BLOCKED: '资格不可用',
    SITE_INACTIVE: '场地停用',
  }[availability];
}

export function managedHostFixedLabel(host: ManagedHostSummary): string {
  const rule = host.activeRule;
  if (!rule) return '当前无固定关系';
  return `固定：${rule.artistNickname} · ${weekdayLabel(rule.weekdays)} · ${fixedTimeLabel(
    rule.startMinute,
    rule.startMinute + rule.durationMinutes,
  )}`;
}

export function managedHostPendingLabel(request: PendingFixedRequest): string {
  return `待审核：${requestTypeLabel(request.requestType)} · ${request.effectiveFrom} 生效`;
}

export function managedHostActionRoute(
  action: 'booking' | 'fixed' | 'managed-host-detail',
  hostId: string,
  date: string,
): string {
  return `/pages/${action}/index?hostId=${encodeURIComponent(hostId)}&date=${encodeURIComponent(date)}`;
}

export function currentBusinessDate(now = new Date()): string {
  return BUSINESS_DATE.format(now);
}

export function managedHostDetailDates(now = new Date()): readonly {
  readonly date: string;
  readonly label: string;
}[] {
  return Array.from({ length: 8 }, (_, offset) => {
    const date = new Date(now.getTime() + offset * 86_400_000);
    return {
      date: BUSINESS_DATE.format(date),
      label: offset === 0 ? '今日' : offset === 1 ? '明日' : DETAIL_DATE_LABEL.format(date),
    };
  });
}

export function toBookingHost(host: ManagedHostSummary): HostSummary {
  return {
    hostCode: host.hostCode,
    id: host.hostId,
    nickname: host.hostName,
    qualificationStatus: host.qualificationStatus,
    realName: host.hostName,
    siteId: host.siteId,
  };
}
