import { useCallback, useEffect, useState } from 'react';

import { ApiError } from './api-client';
import type { SessionTokenPair } from './auth-session';
import { makeupTypeLabel } from './makeup-type';
import { cancelAppointment, listAppointments, type MobileAppointment } from './mobile-api';
import { businessDate, isoTimeLabel } from './mobile-utils';

interface MobileScheduleProps {
  readonly onReschedule: (appointment: MobileAppointment) => void;
  readonly session: SessionTokenPair;
}

type Range = 'HISTORY' | 'SEVEN_DAYS' | 'TODAY' | 'TOMORROW';

const RANGES: readonly { readonly id: Range; readonly label: string }[] = [
  { id: 'TODAY', label: '今日' },
  { id: 'TOMORROW', label: '明日' },
  { id: 'SEVEN_DAYS', label: '未来七日' },
  { id: 'HISTORY', label: '历史' },
];

function dates(
  range: Range,
  historyFrom: string,
  historyTo: string,
): { readonly from: string; readonly to: string } {
  if (range === 'TODAY') return { from: businessDate(), to: businessDate() };
  if (range === 'TOMORROW') return { from: businessDate(1), to: businessDate(1) };
  if (range === 'SEVEN_DAYS') return { from: businessDate(), to: businessDate(7) };
  return { from: historyFrom, to: historyTo };
}

function validHistoryRange(from: string, to: string): boolean {
  const rangeDays = Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1;
  return Number.isFinite(rangeDays) && rangeDays >= 1 && rangeDays <= 31;
}

const STATUS_LABELS = {
  BOOKED: '已预约',
  CANCELLED: '已取消',
  COMPLETED: '已完成',
} as const;

export function MobileSchedule({ onReschedule, session }: MobileScheduleProps) {
  const [range, setRange] = useState<Range>('TODAY');
  const [historyFrom, setHistoryFrom] = useState(businessDate(-30));
  const [historyTo, setHistoryTo] = useState(businessDate(-1));
  const [items, setItems] = useState<readonly MobileAppointment[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      if (range === 'HISTORY' && !validHistoryRange(historyFrom, historyTo)) {
        setError('历史排班每次最多查询 31 天，请重新选择日期');
        return;
      }
      const value = dates(range, historyFrom, historyTo);
      setItems((await listAppointments(session.accessToken, value.from, value.to)).items);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : '排班读取失败，请稍后重试');
    } finally {
      setBusy(false);
    }
  }, [historyFrom, historyTo, range, session.accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  async function cancel(item: MobileAppointment) {
    if (!window.confirm('确认取消这条预约？取消后档期会立即释放。')) return;
    setBusy(true);
    setError(null);
    try {
      await cancelAppointment(session.accessToken, item.id, item.rowVersion);
      await load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : '取消失败，请刷新后重试');
      setBusy(false);
    }
  }

  return (
    <section className="mobile-view">
      <header className="mobile-section-header">
        <div>
          <p className="eyebrow">排班</p>
          <h1>我的排班</h1>
        </div>
        <button className="text-button" disabled={busy} onClick={() => void load()} type="button">
          刷新
        </button>
      </header>
      <div className="mobile-tabs">
        {RANGES.map((item) => (
          <button
            className={range === item.id ? 'active' : ''}
            disabled={busy}
            key={item.id}
            onClick={() => setRange(item.id)}
            type="button"
          >
            {item.label}
          </button>
        ))}
      </div>
      {range === 'HISTORY' ? (
        <div className="mobile-history-range">
          <label>
            开始日期
            <input
              max={historyTo}
              onChange={(event) => setHistoryFrom(event.target.value)}
              type="date"
              value={historyFrom}
            />
          </label>
          <label>
            结束日期
            <input
              max={businessDate(-1)}
              min={historyFrom}
              onChange={(event) => setHistoryTo(event.target.value)}
              type="date"
              value={historyTo}
            />
          </label>
        </div>
      ) : null}
      {error ? <p className="form-error">{error}</p> : null}
      {busy && items.length === 0 ? <p className="mobile-state">正在读取排班…</p> : null}
      {!busy && items.length === 0 ? <p className="mobile-state">当前范围暂无预约。</p> : null}
      <div className="mobile-list">
        {items.map((item) => {
          const canChange = item.status === 'BOOKED' && item.date > businessDate();
          return (
            <article className="mobile-card" key={item.id}>
              <div className="mobile-card-heading">
                <strong>
                  {session.role.roleCode === 'ARTIST'
                    ? `${item.hostName} · ${item.hostCode}`
                    : item.artistNickname}
                </strong>
                <span className={`status-pill ${item.status.toLowerCase()}`}>
                  {STATUS_LABELS[item.status]}
                </span>
              </div>
              <p className="mobile-card-time">
                {item.date} · {isoTimeLabel(item.startAt)}—{isoTimeLabel(item.endAt)}
              </p>
              <p className="mobile-meta">
                {item.siteName} · {makeupTypeLabel(item.durationMinutes)} ·{' '}
                {item.appointmentType === 'FIXED' ? '固定预约' : '单次预约'}
              </p>
              <p className="mobile-meta">
                主播：{item.hostName}（{item.hostCode}）<br />
                实际预约化妆师：{item.artistNickname}
              </p>
              {canChange && session.role.roleCode !== 'ARTIST' ? (
                <div className="mobile-actions">
                  <button onClick={() => onReschedule(item)} type="button">
                    改期
                  </button>
                  <button className="danger-text" onClick={() => void cancel(item)} type="button">
                    取消预约
                  </button>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
