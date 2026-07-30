import { type FormEvent, useCallback, useEffect, useState } from 'react';

import { ApiError } from './api-client';
import type { SessionTokenPair } from './auth-session';
import { cancelLeave, createLeave, listLeaves, type LeaveRecord, previewLeave } from './mobile-api';
import { businessDate } from './mobile-utils';

const STATUS_LABEL = {
  ACTIVE: '已生效',
  CANCELLED: '已取消',
  PENDING: '待审核',
  REJECTED: '已驳回',
} as const;

export function MobileLeave({ session }: { readonly session: SessionTokenPair }) {
  const [items, setItems] = useState<readonly LeaveRecord[]>([]);
  const [startDate, setStartDate] = useState(businessDate(1));
  const [endDate, setEndDate] = useState(businessDate(1));
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      setItems(await listLeaves(session.accessToken));
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : '请假记录读取失败');
    } finally {
      setBusy(false);
    }
  }, [session.accessToken]);

  useEffect(() => void load(), [load]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const preview = await previewLeave(session.accessToken, startDate, endDate);
      if (
        !window.confirm(
          session.role.roleCode === 'ARTIST'
            ? `确认提交 ${startDate} 至 ${endDate} 的请假申请？\n审核通过后将取消 ${preview.affectedAppointmentCount} 条预约。`
            : `确认请假 ${startDate} 至 ${endDate}？\n将取消 ${preview.affectedAppointmentCount} 条预约。`,
        )
      ) {
        setBusy(false);
        return;
      }
      await createLeave(session.accessToken, {
        confirmedAffectedAppointmentCount: preview.affectedAppointmentCount,
        endDate,
        ...(reason.trim() ? { reason: reason.trim() } : {}),
        startDate,
      });
      setReason('');
      await load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : '请假提交失败');
      setBusy(false);
    }
  }

  async function cancel(item: LeaveRecord) {
    if (!window.confirm('确认取消这条请假？符合条件的固定预约会按规则恢复。')) return;
    setBusy(true);
    try {
      await cancelLeave(session.accessToken, item.id, item.rowVersion);
      await load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : '取消请假失败');
      setBusy(false);
    }
  }

  return (
    <section className="mobile-view">
      <header className="mobile-section-header">
        <div>
          <p className="eyebrow">请假</p>
          <h1>请假管理</h1>
        </div>
      </header>
      <form className="mobile-form-section" onSubmit={(event) => void submit(event)}>
        <h2>申请请假</h2>
        <div className="two-column-fields">
          <label>
            开始日期
            <input
              max={businessDate(7)}
              min={businessDate(1)}
              onChange={(event) => setStartDate(event.target.value)}
              required
              type="date"
              value={startDate}
            />
          </label>
          <label>
            结束日期
            <input
              max={businessDate(7)}
              min={startDate}
              onChange={(event) => setEndDate(event.target.value)}
              required
              type="date"
              value={endDate}
            />
          </label>
        </div>
        <label>
          原因（选填）
          <input
            maxLength={500}
            onChange={(event) => setReason(event.target.value)}
            value={reason}
          />
        </label>
        <button className="primary-button" disabled={busy} type="submit">
          提交请假
        </button>
      </form>
      {error ? <p className="form-error">{error}</p> : null}
      <div className="mobile-list">
        {items.map((item) => (
          <article className="mobile-card" key={item.id}>
            <div className="mobile-card-heading">
              <strong>
                {item.startDate} 至 {item.endDate}
              </strong>
              <span>{STATUS_LABEL[item.status]}</span>
            </div>
            <p className="mobile-meta">
              影响预约 {item.affectedAppointmentCount} 条 · {item.reason || '未填写原因'}
            </p>
            {item.reviewComment ? (
              <p className="mobile-meta">审核说明：{item.reviewComment}</p>
            ) : null}
            {item.status === 'ACTIVE' || item.status === 'PENDING' ? (
              <div className="mobile-actions">
                <button className="danger-text" onClick={() => void cancel(item)} type="button">
                  取消请假
                </button>
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}
