import { describe, expect, it } from 'vitest';

import { MAKEUP_TYPE_OPTIONS, makeupTypeLabel } from './makeup-type';

describe('makeup type mapping', () => {
  it('maps every selectable makeup type to its fixed duration', () => {
    expect(MAKEUP_TYPE_OPTIONS).toEqual([
      { durationMinutes: 30, label: '现代妆' },
      { durationMinutes: 45, label: '特殊妆' },
      { durationMinutes: 15, label: '指导妆' },
      { durationMinutes: 60, label: '仿妆' },
    ]);
  });

  it('derives the makeup type from persisted appointment duration', () => {
    expect(makeupTypeLabel(15)).toBe('指导妆（15分钟）');
    expect(makeupTypeLabel(30)).toBe('现代妆（30分钟）');
    expect(makeupTypeLabel(45)).toBe('特殊妆（45分钟）');
    expect(makeupTypeLabel(60)).toBe('仿妆（60分钟）');
  });
});
