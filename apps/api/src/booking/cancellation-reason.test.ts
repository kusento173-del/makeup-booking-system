import { describe, expect, it } from 'vitest';

import { cancellationReasonLabel } from './cancellation-reason';

describe('cancellationReasonLabel', () => {
  it.each([
    ['HOST_LEAVE', '主播请假'],
    ['ARTIST_LEAVE', '化妆师请假'],
    ['ARTIST_UNAVAILABLE_PERIOD', '化妆师请假'],
    ['USER_CANCELLED', '主播取消'],
    ['RESCHEDULED', '主播取消'],
    [null, '主播取消'],
  ] as const)('maps %s to %s', (code, label) => {
    expect(cancellationReasonLabel(code)).toBe(label);
  });
});
