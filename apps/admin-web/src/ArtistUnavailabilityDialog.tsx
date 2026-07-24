import { type FormEvent, useEffect, useState } from 'react';

import { ApiError } from './api-client';
import {
  cancelArtistUnavailablePeriod,
  createArtistUnavailablePeriod,
  type ArtistUnavailablePeriod,
  type ArtistUnavailablePeriodPreview,
  listArtistUnavailablePeriods,
  previewArtistUnavailablePeriod,
} from './artist-unavailability-api';
import type { ScheduleArtist } from './schedule-board-api';

interface ArtistUnavailabilityDialogProps {
  readonly artist: ScheduleArtist;
  readonly initialDate: string;
  readonly maxDate: string;
  readonly minDate: string;
  readonly onClose: () => void;
  readonly onSuccess: () => void;
  readonly onUnauthorized: () => void;
  readonly token: string;
}

function minuteValue(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const result = hour * 60 + minute;
  return hour < 24 && minute < 60 && result % 15 === 0 ? result : null;
}

function minuteLabel(minute: number): string {
  if (minute === 1440) return '24:00';
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}

export function ArtistUnavailabilityDialog({
  artist,
  initialDate,
  maxDate,
  minDate,
  onClose,
  onSuccess,
  onUnauthorized,
  token,
}: ArtistUnavailabilityDialogProps) {
  const [periods, setPeriods] = useState<readonly ArtistUnavailablePeriod[]>([]);
  const [date, setDate] = useState(initialDate);
  const [startTime, setStartTime] = useState('14:00');
  const [endTime, setEndTime] = useState('15:00');
  const [reason, setReason] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [preview, setPreview] = useState<ArtistUnavailablePeriodPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void listArtistUnavailablePeriods(token, artist.artistId)
      .then((items) => active && setPeriods(items))
      .catch((cause: unknown) => {
        if (!active) return;
        if (cause instanceof ApiError && cause.status === 401) {
          onUnauthorized();
          return;
        }
        setError(cause instanceof ApiError ? cause.message : '不可排班时段加载失败');
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [artist.artistId, onUnauthorized, token]);

  function resetPreview(): void {
    setPreview(null);
    setError(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const startMinute = minuteValue(startTime);
    const endMinute = minuteValue(endTime);
    if (startMinute === null || endMinute === null || endMinute <= startMinute) {
      setError('请选择有效的 15 分钟粒度时间范围');
      return;
    }
    if (!reason.trim()) {
      setError('请填写代操作原因');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (!preview) {
        setPreview(
          await previewArtistUnavailablePeriod(token, {
            artistId: artist.artistId,
            endMinute,
            startMinute,
            unavailableDate: date,
          }),
        );
        return;
      }
      const created = await createArtistUnavailablePeriod(token, {
        artistId: artist.artistId,
        confirmedAffectedAppointmentCount: preview.affectedAppointmentCount,
        endMinute: preview.endMinute,
        reason: reason.trim(),
        startMinute: preview.startMinute,
        unavailableDate: preview.unavailableDate,
      });
      setPeriods((current) => [...current, created]);
      setPreview(null);
      setReason('');
      onSuccess();
    } catch (cause) {
      setPreview(null);
      if (cause instanceof ApiError && cause.status === 401) {
        onUnauthorized();
        return;
      }
      setError(cause instanceof ApiError ? cause.message : '设置失败，请稍后重试');
    } finally {
      setBusy(false);
    }
  }

  async function cancel(period: ArtistUnavailablePeriod): Promise<void> {
    if (!cancelReason.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await cancelArtistUnavailablePeriod(token, period.id, {
        expectedRowVersion: period.rowVersion,
        reason: cancelReason.trim(),
      });
      setPeriods((current) => current.filter((item) => item.id !== period.id));
      setCancelReason('');
      onSuccess();
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        onUnauthorized();
        return;
      }
      setError(cause instanceof ApiError ? cause.message : '撤销失败，请稍后重试');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <section
        aria-labelledby="artist-unavailability-title"
        aria-modal="true"
        className="dialog unavailability-dialog"
        role="dialog"
      >
        <header className="dialog-header">
          <div>
            <h2 id="artist-unavailability-title">临时不可排班</h2>
            <p className="dialog-subtitle">{artist.artistNickname} · 无需审批，立即生效</p>
          </div>
          <button
            aria-label="关闭"
            className="icon-button"
            disabled={busy}
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </header>

        <form className="record-form" onSubmit={(event) => void submit(event)}>
          <div className="booking-form-grid">
            <label>
              <span>日期</span>
              <input
                max={maxDate}
                min={minDate}
                onChange={(event) => {
                  setDate(event.target.value);
                  resetPreview();
                }}
                type="date"
                value={date}
              />
            </label>
            <label>
              <span>开始时间</span>
              <input
                onChange={(event) => {
                  setStartTime(event.target.value);
                  resetPreview();
                }}
                step={900}
                type="time"
                value={startTime}
              />
            </label>
            <label>
              <span>结束时间</span>
              <input
                onChange={(event) => {
                  setEndTime(event.target.value);
                  resetPreview();
                }}
                step={900}
                type="time"
                value={endTime}
              />
            </label>
          </div>
          <label htmlFor="unavailability-reason">代操作原因</label>
          <textarea
            id="unavailability-reason"
            maxLength={500}
            onChange={(event) => {
              setReason(event.target.value);
              resetPreview();
            }}
            placeholder="例如：14:00–15:00 上课"
            rows={2}
            value={reason}
          />
          {preview ? (
            <p className="dialog-note warning-note">
              将取消 {preview.affectedAppointmentCount}{' '}
              条重叠预约。固定关系保留，撤销时段后不会自动恢复预约。
            </p>
          ) : null}
          {error ? <p className="form-error">{error}</p> : null}
          <div className="dialog-actions">
            <button className="secondary-button" disabled={busy} onClick={onClose} type="button">
              关闭
            </button>
            <button className="primary-button" disabled={busy || !reason.trim()} type="submit">
              {busy ? '正在处理…' : preview ? '确认设置' : '预览影响'}
            </button>
          </div>
        </form>

        <div className="unavailability-existing">
          <h3>当前有效时段</h3>
          {loading ? <p className="dialog-note">正在加载…</p> : null}
          {!loading && periods.length === 0 ? (
            <p className="dialog-note">当前没有临时不可排班时段。</p>
          ) : null}
          {periods.length > 0 ? (
            <>
              <label htmlFor="unavailability-cancel-reason">撤销原因</label>
              <input
                id="unavailability-cancel-reason"
                maxLength={500}
                onChange={(event) => setCancelReason(event.target.value)}
                placeholder="撤销时必填"
                value={cancelReason}
              />
              <div className="unavailability-period-list">
                {periods.map((period) => (
                  <div className="unavailability-period" key={period.id}>
                    <div>
                      <strong>
                        {period.unavailableDate} {minuteLabel(period.startMinute)}–
                        {minuteLabel(period.endMinute)}
                      </strong>
                      <span>
                        {period.reason} · 已取消 {period.affectedAppointmentCount} 条预约
                      </span>
                    </div>
                    <button
                      className="text-button danger-text"
                      disabled={busy || !cancelReason.trim()}
                      onClick={() => void cancel(period)}
                      type="button"
                    >
                      撤销
                    </button>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </div>
      </section>
    </div>
  );
}
