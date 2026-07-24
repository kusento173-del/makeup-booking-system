import type { HostSummary } from './booking-api';
import type {
  ManagedHostBookingAvailability,
  ManagedHostSummary,
  PendingFixedRequest,
} from './fixed-api';
import { fixedTimeLabel, requestTypeLabel, weekdayLabel } from './fixed-view';

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
  action: 'booking' | 'fixed',
  hostId: string,
  date: string,
): string {
  return `/pages/${action}/index?hostId=${encodeURIComponent(hostId)}&date=${encodeURIComponent(date)}`;
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
