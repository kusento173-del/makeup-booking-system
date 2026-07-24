import { describe, expect, it } from 'vitest';

import {
  createFixedIdempotencyKey,
  fixedTimeLabel,
  nextBusinessDate,
  requestStatusLabel,
  requestTypeLabel,
  weekdayLabel,
} from './fixed-view';

describe('fixed view', () => {
  it('格式化固定时间和星期', () => {
    expect(fixedTimeLabel(570, 600)).toBe('09:30–10:00');
    expect(weekdayLabel([1, 3, 7])).toBe('周一、周三、周日');
  });

  it('格式化申请类型和状态', () => {
    expect(requestTypeLabel('CHANGE')).toBe('变更固定');
    expect(requestStatusLabel('REJECTED')).toBe('已驳回');
  });

  it('生成明日业务日期和稳定前缀幂等键', () => {
    expect(nextBusinessDate(new Date(2026, 6, 24, 12))).toBe('2026-07-25');
    expect(createFixedIdempotencyKey(100, 0)).toBe('miniapp-fixed-100-00000000');
  });
});
