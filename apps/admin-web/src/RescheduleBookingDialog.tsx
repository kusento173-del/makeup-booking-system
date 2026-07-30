import { type FormEvent, useEffect, useState } from 'react';

import { ApiError } from './api-client';
import {
  getBookingSlots,
  rescheduleBooking,
  type BookingDuration,
  type BookingSlotResult,
} from './booking-api';
import { MAKEUP_TYPE_OPTIONS } from './makeup-type';
import type { ScheduleAppointment, ScheduleArtist } from './schedule-board-api';

interface RescheduleBookingDialogProps {
  readonly appointment: ScheduleAppointment;
  readonly artist: ScheduleArtist;
  readonly artists: readonly ScheduleArtist[];
  readonly initialDate: string;
  readonly maxDate: string;
  readonly minDate: string;
  readonly onClose: () => void;
  readonly onSuccess: () => void;
  readonly onUnauthorized: () => void;
  readonly token: string;
}

const UNAVAILABLE_LABELS: Readonly<Record<string, string>> = {
  ARTIST_INACTIVE: '化妆师已停用',
  ARTIST_ON_LEAVE: '化妆师当天请假',
  HOST_DAILY_LIMIT_REACHED: '主播当天已有两次预约',
  HOST_INELIGIBLE: '主播当前没有预约资格',
  HOST_ON_LEAVE: '主播当天请假',
  HOST_SITE_INACTIVE: '主播所属场地已停用',
  NON_WORKING_DAY: '化妆师当天不工作',
  SHIFT_NOT_CONFIGURED: '化妆师尚未设置班次',
  SITE_INACTIVE: '化妆师所属场地已停用',
};

function minuteLabel(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}

export function RescheduleBookingDialog({
  appointment,
  artist,
  artists,
  initialDate,
  maxDate,
  minDate,
  onClose,
  onSuccess,
  onUnauthorized,
  token,
}: RescheduleBookingDialogProps) {
  const [artistId, setArtistId] = useState(artist.artistId);
  const [date, setDate] = useState(initialDate);
  const [durationMinutes, setDurationMinutes] = useState<BookingDuration>(
    appointment.durationMinutes as BookingDuration,
  );
  const [startMinute, setStartMinute] = useState<number | null>(null);
  const [slots, setSlots] = useState<BookingSlotResult | null>(null);
  const [confirmedSecondBooking, setConfirmedSecondBooking] = useState(false);
  const [reason, setReason] = useState('');
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!artistId || !date) return;
    let active = true;
    setLoadingSlots(true);
    setSlots(null);
    setStartMinute(null);
    setConfirmedSecondBooking(false);
    setError(null);
    void getBookingSlots(token, {
      artistId,
      date,
      durationMinutes,
      excludeAppointmentId: appointment.id,
      hostId: appointment.hostId,
    })
      .then((result) => active && setSlots(result))
      .catch((cause: unknown) => {
        if (!active) return;
        if (cause instanceof ApiError && cause.status === 401) {
          onUnauthorized();
          return;
        }
        setError(cause instanceof ApiError ? cause.message : '可预约时间加载失败');
      })
      .finally(() => active && setLoadingSlots(false));
    return () => {
      active = false;
    };
  }, [appointment.hostId, appointment.id, artistId, date, durationMinutes, onUnauthorized, token]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (startMinute === null || !reason.trim()) return;
    if (slots?.requiresSecondConfirmation && !confirmedSecondBooking) return;
    setBusy(true);
    setError(null);
    try {
      await rescheduleBooking(
        token,
        appointment.id,
        {
          artistId,
          confirmedSecondBooking,
          date,
          durationMinutes,
          expectedRowVersion: appointment.rowVersion,
          reason: reason.trim(),
          startMinute,
        },
        crypto.randomUUID(),
      );
      onSuccess();
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        onUnauthorized();
        return;
      }
      setError(cause instanceof ApiError ? cause.message : '改期失败，请稍后重试');
    } finally {
      setBusy(false);
    }
  }

  const unavailableMessage = slots?.unavailableReason
    ? (UNAVAILABLE_LABELS[slots.unavailableReason] ?? '当前条件下不可预约')
    : null;
  const canSubmit =
    !busy &&
    startMinute !== null &&
    Boolean(reason.trim()) &&
    (!slots?.requiresSecondConfirmation || confirmedSecondBooking);

  return (
    <div className="dialog-backdrop" role="presentation">
      <section
        aria-labelledby="reschedule-booking-title"
        aria-modal="true"
        className="dialog booking-dialog"
        role="dialog"
      >
        <header className="dialog-header">
          <div>
            <h2 id="reschedule-booking-title">改期或换化妆师</h2>
            <p className="dialog-subtitle">{appointment.hostName} · 提交成功后原时间自动取消</p>
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
              <span>实际预约化妆师</span>
              <select
                disabled={busy}
                onChange={(event) => setArtistId(event.target.value)}
                value={artistId}
              >
                {artists.map((artist) => (
                  <option key={artist.artistId} value={artist.artistId}>
                    {artist.artistNickname}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>日期</span>
              <input
                disabled={busy}
                max={maxDate}
                min={minDate}
                onChange={(event) => setDate(event.target.value)}
                type="date"
                value={date}
              />
            </label>
            <label>
              <span>妆容类型</span>
              <select
                disabled={busy}
                onChange={(event) =>
                  setDurationMinutes(Number(event.target.value) as BookingDuration)
                }
                value={durationMinutes}
              >
                {MAKEUP_TYPE_OPTIONS.map((option) => (
                  <option key={option.label} value={option.durationMinutes}>
                    {option.label}（{option.durationMinutes}分钟）
                  </option>
                ))}
              </select>
            </label>
          </div>

          <fieldset className="booking-slot-fieldset" disabled={busy || loadingSlots}>
            <legend>可预约时间</legend>
            {loadingSlots ? <p className="booking-slot-message">正在查询空闲时间…</p> : null}
            {!loadingSlots && unavailableMessage ? (
              <p className="booking-slot-message warning-text">{unavailableMessage}</p>
            ) : null}
            {!loadingSlots && slots && !unavailableMessage && slots.slots.length === 0 ? (
              <p className="booking-slot-message">当天没有符合条件的空闲时间</p>
            ) : null}
            {!loadingSlots && slots?.slots.length ? (
              <div className="booking-slot-grid">
                {slots.slots.map((slot) => (
                  <button
                    aria-pressed={startMinute === slot.startMinute}
                    key={slot.startMinute}
                    onClick={() => setStartMinute(slot.startMinute)}
                    type="button"
                  >
                    {minuteLabel(slot.startMinute)}–
                    {minuteLabel(slot.startMinute + durationMinutes)}
                  </button>
                ))}
              </div>
            ) : null}
          </fieldset>

          {slots?.requiresSecondConfirmation ? (
            <label className="booking-confirmation">
              <input
                checked={confirmedSecondBooking}
                onChange={(event) => setConfirmedSecondBooking(event.target.checked)}
                type="checkbox"
              />
              <span>这是该主播当天第 2 次预约，我已确认确有需要。</span>
            </label>
          ) : null}

          <label htmlFor="reschedule-reason">代操作原因</label>
          <textarea
            id="reschedule-reason"
            maxLength={500}
            onChange={(event) => setReason(event.target.value)}
            placeholder="请填写改期或更换化妆师的原因"
            required
            value={reason}
          />
          {error ? <p className="form-error">{error}</p> : null}
          <div className="dialog-actions">
            <button className="secondary-button" disabled={busy} onClick={onClose} type="button">
              返回
            </button>
            <button className="primary-button" disabled={!canSubmit} type="submit">
              {busy ? '正在提交…' : '确认改期'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
