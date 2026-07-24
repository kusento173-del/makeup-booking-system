import { describe, expect, it } from 'vitest';

import { minuteLabel, shiftTimeLabel, validateShiftDefinition, workdayLabel } from './shift-view';

const shift = {
  breakEndMinute: 780,
  breakStartMinute: 720,
  workEndMinute: 1080,
  workStartMinute: 540,
  workdays: [1, 2, 3, 4, 5],
};

describe('shift view', () => {
  it('格式化工作日和班次摘要', () => {
    expect(workdayLabel(shift.workdays)).toBe('周一、周二、周三、周四、周五');
    expect(shiftTimeLabel(shift)).toBe('09:00–18:00，午休 12:00–13:00');
    expect(minuteLabel(1440)).toBe('24:00');
  });

  it('接受合法班次和无午休班次', () => {
    expect(validateShiftDefinition(shift)).toBeNull();
    expect(
      validateShiftDefinition({ ...shift, breakEndMinute: null, breakStartMinute: null }),
    ).toBeNull();
  });

  it('拒绝空工作日和错误时间顺序', () => {
    expect(validateShiftDefinition({ ...shift, workdays: [] })).toBe('请至少选择一个工作日。');
    expect(validateShiftDefinition({ ...shift, workEndMinute: 480 })).toBe(
      '下班时间必须晚于上班时间。',
    );
    expect(validateShiftDefinition({ ...shift, breakEndMinute: 690 })).toBe(
      '午休时间必须完整位于上班和下班时间之间。',
    );
  });
});
