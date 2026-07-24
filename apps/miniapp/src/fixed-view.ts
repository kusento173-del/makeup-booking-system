import type { FixedRequestStatus, FixedRequestType } from './fixed-api';

export const FIXED_DURATIONS = [15, 30, 45, 60] as const;
export const FIXED_WEEKDAYS = [
  { label: '周一', value: 1 },
  { label: '周二', value: 2 },
  { label: '周三', value: 3 },
  { label: '周四', value: 4 },
  { label: '周五', value: 5 },
  { label: '周六', value: 6 },
  { label: '周日', value: 7 },
] as const;

export const FIXED_UNAVAILABLE_LABELS: Readonly<Record<string, string>> = {
  ARTIST_INACTIVE: '该化妆师当前不可固定',
  HOST_HAS_ACTIVE_FIXED_RULE: '该主播已经有固定关系，请使用变更功能',
  HOST_HAS_PENDING_FIXED_REQUEST: '该主播已有待审核固定申请',
  HOST_INELIGIBLE: '该主播当前没有预约资格',
  NO_STABLE_TIME_SLOT: '没有可长期固定的时间，请调整星期、时长或化妆师',
  NON_WORKING_WEEKDAY: '所选星期包含化妆师非工作日',
  SHIFT_NOT_CONFIGURED: '该化妆师尚未设置班次',
  SITE_INACTIVE: '所属场地当前不可预约',
};

export function minuteLabel(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(
    2,
    '0',
  )}`;
}

export function fixedTimeLabel(startMinute: number, endMinute: number): string {
  return `${minuteLabel(startMinute)}–${minuteLabel(endMinute)}`;
}

export function weekdayLabel(weekdays: readonly number[]): string {
  return weekdays
    .map((weekday) => FIXED_WEEKDAYS.find((item) => item.value === weekday)?.label)
    .filter(Boolean)
    .join('、');
}

export function requestTypeLabel(type: FixedRequestType): string {
  return { CANCEL: '取消固定', CHANGE: '变更固定', CREATE: '申请固定' }[type];
}

export function requestStatusLabel(status: FixedRequestStatus): string {
  return { APPROVED: '已通过', PENDING: '待审核', REJECTED: '已驳回', WITHDRAWN: '已撤回' }[status];
}

export function createFixedIdempotencyKey(now = Date.now(), random = Math.random()): string {
  const suffix = Math.floor(random * 1_000_000_000_000)
    .toString(36)
    .padStart(8, '0');
  return `miniapp-fixed-${now}-${suffix}`;
}

export function nextBusinessDate(now = new Date()): string {
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}
