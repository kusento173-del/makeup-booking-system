import { type FormEvent, useState } from 'react';

import { ApiError } from './api-client';
import { cancelBooking } from './booking-api';
import type { ScheduleAppointment } from './schedule-board-api';

interface CancelBookingDialogProps {
  readonly appointment: ScheduleAppointment;
  readonly onClose: () => void;
  readonly onSuccess: () => void;
  readonly onUnauthorized: () => void;
  readonly token: string;
}

export function CancelBookingDialog({
  appointment,
  onClose,
  onSuccess,
  onUnauthorized,
  token,
}: CancelBookingDialogProps) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedReason = reason.trim();
    if (!normalizedReason) return;
    setBusy(true);
    setError(null);
    try {
      await cancelBooking(token, appointment.id, {
        expectedRowVersion: appointment.rowVersion,
        reason: normalizedReason,
      });
      onSuccess();
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        onUnauthorized();
        return;
      }
      setError(cause instanceof ApiError ? cause.message : '取消失败，请稍后重试');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <section
        aria-labelledby="cancel-booking-title"
        aria-modal="true"
        className="dialog"
        role="dialog"
      >
        <header className="dialog-header">
          <div>
            <h2 id="cancel-booking-title">取消预约</h2>
            <p className="dialog-subtitle">{appointment.hostName} · 取消后立即释放档期</p>
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
          <label htmlFor="cancel-reason">取消原因</label>
          <textarea
            autoFocus
            id="cancel-reason"
            maxLength={500}
            onChange={(event) => setReason(event.target.value)}
            placeholder="请填写客服代操作原因"
            required
            value={reason}
          />
          {error ? <p className="form-error">{error}</p> : null}
          <div className="dialog-actions">
            <button className="secondary-button" disabled={busy} onClick={onClose} type="button">
              返回
            </button>
            <button className="danger-button" disabled={busy || !reason.trim()} type="submit">
              {busy ? '正在取消…' : '确认取消'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
