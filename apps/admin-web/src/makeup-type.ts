export type BookingDuration = 15 | 30 | 45 | 60;

export interface MakeupTypeOption {
  readonly durationMinutes: BookingDuration;
  readonly label: string;
}

export const MAKEUP_TYPE_OPTIONS: readonly MakeupTypeOption[] = [
  { durationMinutes: 30, label: '现代妆' },
  { durationMinutes: 45, label: '特殊妆' },
  { durationMinutes: 15, label: '指导妆' },
  { durationMinutes: 60, label: '仿妆' },
];

export function makeupTypeLabel(durationMinutes: number): string {
  const option = MAKEUP_TYPE_OPTIONS.find((item) => item.durationMinutes === durationMinutes);
  return option ? `${option.label}（${option.durationMinutes}分钟）` : `${durationMinutes}分钟`;
}
