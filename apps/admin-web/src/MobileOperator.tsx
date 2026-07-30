import { useCallback, useEffect, useState } from 'react';

import { ApiError } from './api-client';
import type { SessionTokenPair } from './auth-session';
import { approvalStatusLabel, FIXED_REQUEST_TYPE_LABELS } from './business-labels';
import {
  type BookingDuration,
  cancelFixedRule,
  createFixedRequest,
  type FixedAvailability,
  type FixedRequest,
  getFixedAvailability,
  listArtists,
  listFixedRequests,
  listManagedHosts,
  type ManagedHost,
  type MobileArtist,
  withdrawFixedRequest,
} from './mobile-api';
import { MAKEUP_TYPE_OPTIONS, makeupTypeLabel } from './makeup-type';
import { businessDate, minuteLabel, WEEKDAYS } from './mobile-utils';

interface MobileOperatorProps {
  readonly onBookHost: (hostId: string) => void;
  readonly session: SessionTokenPair;
  readonly view: 'fixed' | 'managed-hosts';
}

function errorMessage(cause: unknown): string {
  return cause instanceof ApiError ? cause.message : '操作失败，请稍后重试';
}

export function MobileOperator({ onBookHost, session, view }: MobileOperatorProps) {
  const [date, setDate] = useState(businessDate(1));
  const [hosts, setHosts] = useState<readonly ManagedHost[]>([]);
  const [requests, setRequests] = useState<readonly FixedRequest[]>([]);
  const [artists, setArtists] = useState<readonly MobileArtist[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const [hostPage, requestPage, artistPage] = await Promise.all([
        listManagedHosts(session.accessToken, date),
        listFixedRequests(session.accessToken),
        listArtists(session.accessToken),
      ]);
      setHosts(hostPage.items);
      setRequests(requestPage.items);
      setArtists(
        artistPage.items.filter(
          (artist) => artist.employmentStatus === 'ACTIVE' && artist.initialShiftConfigured,
        ),
      );
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }, [date, session.accessToken]);

  useEffect(() => void load(), [load]);

  if (view === 'managed-hosts') {
    return (
      <section className="mobile-view">
        <header className="mobile-section-header">
          <div>
            <p className="eyebrow">运营负责范围</p>
            <h1>负责主播</h1>
          </div>
        </header>
        <label className="mobile-date-filter">
          查看日期
          <input
            min={businessDate()}
            onChange={(event) => setDate(event.target.value)}
            type="date"
            value={date}
          />
        </label>
        {error ? <p className="form-error">{error}</p> : null}
        {!busy && hosts.length === 0 ? (
          <p className="mobile-state">该日期没有有效负责主播。</p>
        ) : null}
        <div className="mobile-list">
          {hosts.map((host) => (
            <article className="mobile-card" key={host.hostId}>
              <div className="mobile-card-heading">
                <strong>
                  {host.hostName} · {host.hostCode}
                </strong>
                <span>{host.bookingAvailability === 'AVAILABLE' ? '可预约' : '不可预约'}</span>
              </div>
              <p className="mobile-meta">{host.siteName}</p>
              <p className="mobile-meta">
                {host.activeRule
                  ? `固定：${host.activeRule.artistNickname} · ${host.activeRule.weekdays
                      .map((day) => WEEKDAYS.find((item) => item.id === day)?.label)
                      .join(
                        '、',
                      )} · ${minuteLabel(host.activeRule.startMinute)} · ${makeupTypeLabel(
                      host.activeRule.durationMinutes,
                    )}`
                  : '暂无固定化妆师'}
              </p>
              {host.pendingRequest ? (
                <p className="warning-box">
                  已有待审核的固定申请，{host.pendingRequest.effectiveFrom} 生效。
                </p>
              ) : null}
              <div className="mobile-actions">
                <button
                  disabled={host.bookingAvailability !== 'AVAILABLE'}
                  onClick={() => onBookHost(host.hostId)}
                  type="button"
                >
                  代预约
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
    );
  }

  return (
    <FixedWorkspace
      artists={artists}
      busy={busy}
      error={error}
      hosts={hosts}
      onReload={load}
      requests={requests}
      session={session}
    />
  );
}

function FixedWorkspace({
  artists,
  busy,
  error,
  hosts,
  onReload,
  requests,
  session,
}: {
  readonly artists: readonly MobileArtist[];
  readonly busy: boolean;
  readonly error: string | null;
  readonly hosts: readonly ManagedHost[];
  readonly onReload: () => Promise<void>;
  readonly requests: readonly FixedRequest[];
  readonly session: SessionTokenPair;
}) {
  const [hostId, setHostId] = useState('');
  const [artistId, setArtistId] = useState('');
  const [duration, setDuration] = useState<BookingDuration>(30);
  const [effectiveFrom, setEffectiveFrom] = useState(businessDate(1));
  const [weekdays, setWeekdays] = useState<readonly number[]>([1, 2, 3, 4, 5]);
  const [reason, setReason] = useState('');
  const [availability, setAvailability] = useState<FixedAvailability | null>(null);
  const [selectedMinute, setSelectedMinute] = useState<number | null>(null);
  const [localBusy, setLocalBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const host = hosts.find((item) => item.hostId === hostId);
  const activeRuleId = host?.activeRule?.id;

  useEffect(() => {
    setAvailability(null);
    setSelectedMinute(null);
    if (!hostId || !artistId || weekdays.length === 0) return;
    let active = true;
    setLocalBusy(true);
    setLocalError(null);
    void getFixedAvailability(session.accessToken, {
      artistId,
      ...(activeRuleId ? { currentRuleId: activeRuleId } : {}),
      durationMinutes: duration,
      hostId,
      requestedStartDate: effectiveFrom,
      weekdays,
    })
      .then((value) => active && setAvailability(value))
      .catch((cause: unknown) => active && setLocalError(errorMessage(cause)))
      .finally(() => active && setLocalBusy(false));
    return () => {
      active = false;
    };
  }, [activeRuleId, artistId, duration, effectiveFrom, hostId, session.accessToken, weekdays]);

  async function submit() {
    if (!host || !artistId || selectedMinute === null || !reason.trim()) return;
    setLocalBusy(true);
    setLocalError(null);
    try {
      await createFixedRequest(session.accessToken, {
        artistId,
        ...(host.activeRule ? { currentRuleId: host.activeRule.id } : {}),
        durationMinutes: duration,
        effectiveFrom,
        hostId,
        reason: reason.trim(),
        startMinute: selectedMinute,
        weekdays,
      });
      setReason('');
      setAvailability(null);
      setSelectedMinute(null);
      await onReload();
    } catch (cause) {
      setLocalError(errorMessage(cause));
    } finally {
      setLocalBusy(false);
    }
  }

  async function cancelRule() {
    if (!host?.activeRule || !reason.trim()) return;
    if (!window.confirm('确认申请取消固定关系？')) return;
    setLocalBusy(true);
    try {
      await cancelFixedRule(session.accessToken, {
        currentRuleId: host.activeRule.id,
        effectiveFrom,
        hostId,
        reason: reason.trim(),
      });
      await onReload();
    } catch (cause) {
      setLocalError(errorMessage(cause));
    } finally {
      setLocalBusy(false);
    }
  }

  async function withdraw(request: FixedRequest) {
    setLocalBusy(true);
    try {
      await withdrawFixedRequest(session.accessToken, request.id, request.rowVersion);
      await onReload();
    } catch (cause) {
      setLocalError(errorMessage(cause));
    } finally {
      setLocalBusy(false);
    }
  }

  return (
    <section className="mobile-view">
      <header className="mobile-section-header">
        <div>
          <p className="eyebrow">运营申请</p>
          <h1>固定预约</h1>
        </div>
      </header>
      <div className="mobile-form-section">
        <label>
          主播
          <select onChange={(event) => setHostId(event.target.value)} value={hostId}>
            <option value="">请选择</option>
            {hosts.map((item) => (
              <option key={item.hostId} value={item.hostId}>
                {item.hostName} · {item.hostCode}
              </option>
            ))}
          </select>
        </label>
        {host ? (
          <>
            <p className="mobile-meta">
              {host.activeRule
                ? `当前固定：${host.activeRule.artistNickname} · ${minuteLabel(
                    host.activeRule.startMinute,
                  )} · ${makeupTypeLabel(host.activeRule.durationMinutes)}`
                : '当前没有固定关系'}
            </p>
            {host.pendingRequest ? (
              <p className="warning-box">该主播已有待审核申请，请先等待或撤回。</p>
            ) : null}
            <label>
              化妆师
              <select onChange={(event) => setArtistId(event.target.value)} value={artistId}>
                <option value="">请选择</option>
                {artists.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nickname}
                  </option>
                ))}
              </select>
            </label>
            <label>
              生效日期
              <input
                min={businessDate(1)}
                onChange={(event) => setEffectiveFrom(event.target.value)}
                type="date"
                value={effectiveFrom}
              />
            </label>
            <fieldset>
              <legend>固定星期</legend>
              <div className="weekday-grid">
                {WEEKDAYS.map((day) => (
                  <label key={day.id}>
                    <input
                      checked={weekdays.includes(day.id)}
                      onChange={(event) =>
                        setWeekdays(
                          event.target.checked
                            ? [...weekdays, day.id].sort()
                            : weekdays.filter((value) => value !== day.id),
                        )
                      }
                      type="checkbox"
                    />
                    {day.label}
                  </label>
                ))}
              </div>
            </fieldset>
            <label>
              妆容类型
              <select
                onChange={(event) => setDuration(Number(event.target.value) as BookingDuration)}
                value={duration}
              >
                {MAKEUP_TYPE_OPTIONS.map((option) => (
                  <option key={option.label} value={option.durationMinutes}>
                    {option.label}（{option.durationMinutes}分钟）
                  </option>
                ))}
              </select>
            </label>
            <label>
              申请原因
              <input
                maxLength={500}
                onChange={(event) => setReason(event.target.value)}
                value={reason}
              />
            </label>
            {availability ? (
              <div>
                <p className="field-hint">
                  仅显示可长期固定的时间；有单次占用时会标出最早开始日期。
                </p>
                <div className="slot-grid">
                  {availability.slots
                    .filter((slot) => slot.available)
                    .map((slot) => (
                      <button
                        className={selectedMinute === slot.startMinute ? 'active' : ''}
                        key={slot.startMinute}
                        onClick={() => {
                          setSelectedMinute(slot.startMinute);
                          if (slot.earliestStartDate && slot.earliestStartDate > effectiveFrom)
                            setEffectiveFrom(slot.earliestStartDate);
                        }}
                        type="button"
                      >
                        {minuteLabel(slot.startMinute)}
                        {slot.earliestStartDate ? <small>{slot.earliestStartDate} 起</small> : null}
                      </button>
                    ))}
                </div>
              </div>
            ) : null}
            <div className="mobile-actions">
              <button
                disabled={localBusy || selectedMinute === null || Boolean(host.pendingRequest)}
                onClick={() => void submit()}
                type="button"
              >
                {host.activeRule ? '提交变更申请' : '提交固定申请'}
              </button>
              {host.activeRule ? (
                <button
                  className="danger-text"
                  disabled={localBusy || Boolean(host.pendingRequest)}
                  onClick={() => void cancelRule()}
                  type="button"
                >
                  申请取消固定
                </button>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
      {error || localError ? <p className="form-error">{localError ?? error}</p> : null}
      {busy || localBusy ? <p className="mobile-state">正在同步固定关系…</p> : null}
      <div className="mobile-list">
        {requests.map((request) => (
          <article className="mobile-card" key={request.id}>
            <div className="mobile-card-heading">
              <strong>
                {request.hostName} · {request.hostCode}
              </strong>
              <span>{approvalStatusLabel(request.status)}</span>
            </div>
            <p className="mobile-meta">
              {FIXED_REQUEST_TYPE_LABELS[request.requestType]} · {request.effectiveFrom} 生效 ·{' '}
              {request.reason}
            </p>
            {request.status === 'PENDING' ? (
              <div className="mobile-actions">
                <button onClick={() => void withdraw(request)} type="button">
                  撤回申请
                </button>
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}
