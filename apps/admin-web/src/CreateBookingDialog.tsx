import { type FormEvent, type KeyboardEvent, useEffect, useState } from 'react';

import { ApiError } from './api-client';
import {
  createBooking,
  getBookingSlots,
  type BookingDuration,
  type BookingSlotResult,
} from './booking-api';
import { MAKEUP_TYPE_OPTIONS } from './makeup-type';
import { searchHosts, type HostSummary } from './master-data-api';
import type { ScheduleArtist } from './schedule-board-api';

interface CreateBookingDialogProps {
  readonly artists: readonly ScheduleArtist[];
  readonly initialDate: string;
  readonly maxDate: string;
  readonly minDate: string;
  readonly onClose: () => void;
  readonly onSuccess: (date: string) => void;
  readonly onUnauthorized: () => void;
  readonly siteId: string;
  readonly siteName: string;
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
  SITE_INACTIVE: '场地已停用',
};

function minuteLabel(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}

function hostName(host: HostSummary): string {
  return host.nickname ?? host.realName;
}

export function CreateBookingDialog({
  artists,
  initialDate,
  maxDate,
  minDate,
  onClose,
  onSuccess,
  onUnauthorized,
  siteId,
  siteName,
  token,
}: CreateBookingDialogProps) {
  const [search, setSearch] = useState('');
  const [hosts, setHosts] = useState<readonly HostSummary[]>([]);
  const [selectedHost, setSelectedHost] = useState<HostSummary | null>(null);
  const [artistId, setArtistId] = useState(artists[0]?.artistId ?? '');
  const [date, setDate] = useState(initialDate);
  const [durationMinutes, setDurationMinutes] = useState<BookingDuration>(30);
  const [startMinute, setStartMinute] = useState<number | null>(null);
  const [slots, setSlots] = useState<BookingSlotResult | null>(null);
  const [confirmedSecondBooking, setConfirmedSecondBooking] = useState(false);
  const [reason, setReason] = useState('');
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runSearch() {
    const normalizedSearch = search.normalize('NFKC').trim();
    if (!normalizedSearch) return;
    setSearching(true);
    setSearched(true);
    setSelectedHost(null);
    setHosts([]);
    setError(null);
    try {
      const result = await searchHosts(token, normalizedSearch, siteId);
      setHosts(
        result.items.filter(
          (host) => host.siteId === siteId && host.qualificationStatus === 'ACTIVE',
        ),
      );
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        onUnauthorized();
        return;
      }
      setError(cause instanceof ApiError ? cause.message : '主播搜索失败');
    } finally {
      setSearching(false);
    }
  }

  function searchOnEnter(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    void runSearch();
  }

  useEffect(() => {
    if (!selectedHost || !artistId || !date) {
      setSlots(null);
      return;
    }
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
      hostId: selectedHost.id,
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
  }, [artistId, date, durationMinutes, onUnauthorized, selectedHost, token]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedHost || startMinute === null || !reason.trim()) return;
    if (slots?.requiresSecondConfirmation && !confirmedSecondBooking) return;
    setBusy(true);
    setError(null);
    try {
      await createBooking(
        token,
        {
          artistId,
          confirmedSecondBooking,
          date,
          durationMinutes,
          hostId: selectedHost.id,
          reason: reason.trim(),
          startMinute,
        },
        crypto.randomUUID(),
      );
      onSuccess(date);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        onUnauthorized();
        return;
      }
      setError(cause instanceof ApiError ? cause.message : '代录预约失败，请稍后重试');
    } finally {
      setBusy(false);
    }
  }

  const unavailableMessage = slots?.unavailableReason
    ? (UNAVAILABLE_LABELS[slots.unavailableReason] ?? '当前条件下不可预约')
    : null;
  const canSubmit =
    !busy &&
    selectedHost !== null &&
    startMinute !== null &&
    Boolean(reason.trim()) &&
    (!slots?.requiresSecondConfirmation || confirmedSecondBooking);

  return (
    <div className="dialog-backdrop" role="presentation">
      <section
        aria-labelledby="create-booking-title"
        aria-modal="true"
        className="dialog booking-dialog"
        role="dialog"
      >
        <header className="dialog-header">
          <div>
            <h2 id="create-booking-title">代录预约</h2>
            <p className="dialog-subtitle">{siteName} · 仅可预约未来七日</p>
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
          <label htmlFor="booking-host-search">主播编号或姓名</label>
          <div className="booking-host-search">
            <input
              autoFocus
              id="booking-host-search"
              maxLength={64}
              onChange={(event) => {
                setSearch(event.target.value);
                setHosts([]);
                setSelectedHost(null);
                setSearched(false);
              }}
              onKeyDown={searchOnEnter}
              placeholder="输入主播编号最准确"
              value={search}
            />
            <button
              className="secondary-button"
              disabled={searching || !search.trim()}
              onClick={() => void runSearch()}
              type="button"
            >
              {searching ? '搜索中…' : '搜索'}
            </button>
          </div>
          {hosts.length > 0 ? (
            <div className="booking-host-results" role="listbox">
              {hosts.map((host) => (
                <button
                  aria-selected={selectedHost?.id === host.id}
                  key={host.id}
                  onClick={() => setSelectedHost(host)}
                  role="option"
                  type="button"
                >
                  <strong>{hostName(host)}</strong>
                  <span>{host.hostCode}</span>
                </button>
              ))}
            </div>
          ) : null}
          {!searching && searched && hosts.length === 0 && !selectedHost ? (
            <p className="booking-slot-message">
              未找到本站可预约主播，请核对编号、姓名、场地和预约资格。
            </p>
          ) : null}

          <div className="booking-form-grid">
            <label>
              <span>实际预约化妆师</span>
              <select
                disabled={busy || artists.length === 0}
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

          <fieldset
            className="booking-slot-fieldset"
            disabled={busy || loadingSlots || !selectedHost}
          >
            <legend>可预约时间</legend>
            {!selectedHost ? <p className="booking-slot-message">请先选择主播</p> : null}
            {selectedHost && loadingSlots ? (
              <p className="booking-slot-message">正在查询空闲时间…</p>
            ) : null}
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
              <span>这是该主播当天第 2 次预约，我已确认确有需要。每天最多两次。</span>
            </label>
          ) : null}

          <label htmlFor="create-booking-reason">代录原因</label>
          <textarea
            id="create-booking-reason"
            maxLength={500}
            onChange={(event) => setReason(event.target.value)}
            placeholder="请填写客服或管理员代录原因"
            required
            value={reason}
          />
          {error ? <p className="form-error">{error}</p> : null}
          <div className="dialog-actions">
            <button className="secondary-button" disabled={busy} onClick={onClose} type="button">
              返回
            </button>
            <button className="primary-button" disabled={!canSubmit} type="submit">
              {busy ? '正在创建…' : '确认预约'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
