export type CancellationReasonLabel = '主播取消' | '主播请假' | '化妆师请假';

export function cancellationReasonLabel(code: string | null): CancellationReasonLabel {
  if (code === 'HOST_LEAVE') return '主播请假';
  if (code === 'ARTIST_LEAVE' || code === 'ARTIST_UNAVAILABLE_PERIOD') return '化妆师请假';
  return '主播取消';
}
