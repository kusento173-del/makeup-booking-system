import { describe, expect, it } from 'vitest';

import { minuteToTime, timeToMinute, validateShiftTimes, workdayText } from './shift-view';

describe('shift view', () => {
  it('在分钟值与时间文本之间转换', () => {
    expect(timeToMinute('09:30')).toBe(570);
    expect(minuteToTime(1050)).toBe('17:30');
  });

  it('按星期顺序显示工作日', () => {
    expect(workdayText([5, 1, 3])).toBe('周一、周三、周五');
  });

  it('阻止非 15 分钟粒度和非法午休区间', () => {
    expect(
      validateShiftTimes({
        breakEndMinute: 780,
        breakStartMinute: 720,
        workEndMinute: 1080,
        workStartMinute: 540,
      }),
    ).toBeNull();
    expect(
      validateShiftTimes({
        breakEndMinute: null,
        breakStartMinute: null,
        workEndMinute: 1080,
        workStartMinute: 541,
      }),
    ).toContain('15 分');
    expect(
      validateShiftTimes({
        breakEndMinute: 1140,
        breakStartMinute: 720,
        workEndMinute: 1080,
        workStartMinute: 540,
      }),
    ).toContain('午休');
  });
});
