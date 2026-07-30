import { type FormEvent, useCallback, useEffect, useState } from 'react';

import { ApiError } from './api-client';
import type { SessionTokenPair } from './auth-session';
import { addBusinessDays, currentBusinessDate } from './business-date';
import {
  directlySetFixedRule,
  type FixedAvailability,
  type FixedRule,
  getFixedRuleAvailability,
} from './fixed-rule-api';
import {
  type ArtistSummary,
  type HostSummary,
  searchArtists,
  searchHosts,
  type SiteSummary,
} from './master-data-api';
import { MAKEUP_TYPE_OPTIONS } from './makeup-type';
import { minuteLabel, WEEKDAYS } from './mobile-utils';

const UNAVAILABLE_LABELS: Readonly<Record<string, string>> = {
  ARTIST_INACTIVE: '化妆师当前不可用',
  HOST_HAS_ACTIVE_FIXED_RULE: '主播已有固定关系，请使用修改功能',
  HOST_HAS_PENDING_FIXED_REQUEST: '主播已有待审核的固定申请',
  HOST_INELIGIBLE: '主播当前没有预约资格',
  NO_STABLE_TIME_SLOT: '没有可长期固定的时间',
  NON_WORKING_WEEKDAY: '所选星期包含化妆师非工作日',
  SHIFT_NOT_CONFIGURED: '化妆师尚未设置班次',
  SITE_INACTIVE: '场地当前不可用',
};

function personName(person: HostSummary | ArtistSummary): string {
  return person.nickname ?? person.realName;
}

interface FixedRuleDialogProps {
  readonly onClose: () => void;
  readonly onSaved: () => void;
  readonly onUnauthorized: () => void;
  readonly rule: FixedRule | null;
  readonly session: SessionTokenPair;
  readonly sites: readonly SiteSummary[];
}

export function FixedRuleDialog({
  onClose,
  onSaved,
  onUnauthorized,
  rule,
  session,
  sites,
}: FixedRuleDialogProps) {
  const defaultDate = addBusinessDays(currentBusinessDate(), 1);
  const initialSiteId =
    rule?.siteId ?? session.role.siteId ?? sites.find((site) => site.status === 'ACTIVE')?.id ?? '';
  const [siteId, setSiteId] = useState(initialSiteId);
  const [hosts, setHosts] = useState<readonly HostSummary[]>([]);
  const [artists, setArtists] = useState<readonly ArtistSummary[]>([]);
  const [hostSearch, setHostSearch] = useState('');
  const [artistSearch, setArtistSearch] = useState('');
  const [hostId, setHostId] = useState(rule?.hostId ?? '');
  const [artistId, setArtistId] = useState(rule?.artistId ?? '');
  const [durationMinutes, setDurationMinutes] = useState(rule?.durationMinutes ?? 30);
  const [effectiveFrom, setEffectiveFrom] = useState(defaultDate);
  const [weekdays, setWeekdays] = useState<readonly number[]>(rule?.weekdays ?? [1, 2, 3, 4, 5]);
  const [selectedMinute, setSelectedMinute] = useState<number | null>(rule?.startMinute ?? null);
  const [reason, setReason] = useState('');
  const [availability, setAvailability] = useState<FixedAvailability | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleError = useCallback(
    (cause: unknown, fallback: string) => {
      if (cause instanceof ApiError && cause.status === 401) onUnauthorized();
      else setError(cause instanceof ApiError ? cause.message : fallback);
    },
    [onUnauthorized],
  );

  const loadPeople = useCallback(
    async (kind: 'ARTIST' | 'HOST', search: string) => {
      if (!siteId) return;
      setBusy(true);
      setError('');
      try {
        if (kind === 'HOST') {
          setHosts((await searchHosts(session.accessToken, search, siteId)).items);
        } else {
          setArtists((await searchArtists(session.accessToken, search, siteId)).items);
        }
      } catch (cause) {
        handleError(cause, '人员名单加载失败，请稍后重试');
      } finally {
        setBusy(false);
      }
    },
    [handleError, session.accessToken, siteId],
  );

  useEffect(() => {
    if (!siteId) return;
    setHostId(rule?.siteId === siteId ? rule.hostId : '');
    setArtistId(rule?.siteId === siteId ? rule.artistId : '');
    void Promise.all([loadPeople('HOST', ''), loadPeople('ARTIST', '')]);
  }, [loadPeople, rule, siteId]);

  useEffect(() => {
    setAvailability(null);
    if (!hostId || !artistId || weekdays.length === 0) return;
    let active = true;
    setBusy(true);
    setError('');
    void getFixedRuleAvailability(session.accessToken, {
      artistId,
      ...(rule ? { currentRuleId: rule.id } : {}),
      durationMinutes,
      hostId,
      requestedStartDate: effectiveFrom,
      weekdays,
    })
      .then((value) => {
        if (!active) return;
        if (!Array.isArray(value.slots)) {
          throw new Error('Invalid fixed availability response');
        }
        setAvailability(value);
        setSelectedMinute((current) =>
          value.slots.some((slot) => slot.available && slot.startMinute === current)
            ? current
            : null,
        );
      })
      .catch((cause: unknown) => {
        if (active) handleError(cause, '可固定时间读取失败，请稍后重试');
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [
    artistId,
    durationMinutes,
    effectiveFrom,
    handleError,
    hostId,
    rule,
    session.accessToken,
    weekdays,
  ]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hostId || !artistId || selectedMinute === null || !reason.trim()) return;
    setBusy(true);
    setError('');
    try {
      await directlySetFixedRule(session.accessToken, {
        artistId,
        ...(rule ? { currentRuleId: rule.id } : {}),
        durationMinutes,
        effectiveFrom,
        hostId,
        reason: reason.trim(),
        requestType: rule ? 'CHANGE' : 'CREATE',
        startMinute: selectedMinute,
        weekdays,
      });
      onSaved();
    } catch (cause) {
      handleError(cause, '固定关系保存失败，请稍后重试');
      setBusy(false);
    }
  }

  async function cancelRule() {
    if (!rule || !reason.trim()) {
      setError('请先填写取消原因');
      return;
    }
    if (!window.confirm('确认从所选生效日期起取消这条固定关系？')) return;
    setBusy(true);
    setError('');
    try {
      await directlySetFixedRule(session.accessToken, {
        currentRuleId: rule.id,
        effectiveFrom,
        hostId: rule.hostId,
        reason: reason.trim(),
        requestType: 'CANCEL',
      });
      onSaved();
    } catch (cause) {
      handleError(cause, '固定关系取消失败，请稍后重试');
      setBusy(false);
    }
  }

  const availableSlots = availability?.slots.filter((slot) => slot.available) ?? [];

  return (
    <div className="dialog-backdrop" role="presentation">
      <section
        aria-labelledby="fixed-rule-title"
        aria-modal="true"
        className="dialog wide-dialog"
        role="dialog"
      >
        <div className="dialog-header">
          <h2 id="fixed-rule-title">{rule ? '修改固定主播关系' : '设置固定主播关系'}</h2>
          <button aria-label="关闭" className="icon-button" disabled={busy} onClick={onClose}>
            ×
          </button>
        </div>
        <form className="record-form" onSubmit={(event) => void submit(event)}>
          {session.role.roleCode === 'ADMIN' && !rule ? (
            <>
              <label htmlFor="fixed-site">场地</label>
              <select
                id="fixed-site"
                onChange={(event) => setSiteId(event.target.value)}
                required
                value={siteId}
              >
                <option value="">请选择场地</option>
                {sites
                  .filter((site) => site.status === 'ACTIVE')
                  .map((site) => (
                    <option key={site.id} value={site.id}>
                      {site.name}
                    </option>
                  ))}
              </select>
            </>
          ) : null}

          <label htmlFor="fixed-host-search">查找主播</label>
          <div className="inline-search">
            <input
              disabled={Boolean(rule)}
              id="fixed-host-search"
              onChange={(event) => setHostSearch(event.target.value)}
              placeholder="输入主播编号或姓名"
              value={rule ? `${rule.hostName} · ${rule.hostCode}` : hostSearch}
            />
            {!rule ? (
              <button
                className="secondary-button"
                disabled={busy || !siteId}
                onClick={() => void loadPeople('HOST', hostSearch.trim())}
                type="button"
              >
                查找
              </button>
            ) : null}
          </div>
          {!rule ? (
            <select
              aria-label="主播"
              onChange={(event) => setHostId(event.target.value)}
              required
              value={hostId}
            >
              <option value="">请选择主播</option>
              {hosts.map((host) => (
                <option key={host.id} value={host.id}>
                  {personName(host)} · {host.hostCode}
                </option>
              ))}
            </select>
          ) : null}

          <label htmlFor="fixed-artist-search">查找化妆师</label>
          <div className="inline-search">
            <input
              id="fixed-artist-search"
              onChange={(event) => setArtistSearch(event.target.value)}
              placeholder="输入化妆师昵称或姓名"
              value={artistSearch}
            />
            <button
              className="secondary-button"
              disabled={busy || !siteId}
              onClick={() => void loadPeople('ARTIST', artistSearch.trim())}
              type="button"
            >
              查找
            </button>
          </div>
          <select
            aria-label="化妆师"
            onChange={(event) => setArtistId(event.target.value)}
            required
            value={artistId}
          >
            <option value="">请选择化妆师</option>
            {artists.map((artist) => (
              <option key={artist.id} value={artist.id}>
                {personName(artist)}
              </option>
            ))}
          </select>

          <label htmlFor="fixed-effective-from">生效日期</label>
          <input
            id="fixed-effective-from"
            min={defaultDate}
            onChange={(event) => setEffectiveFrom(event.target.value)}
            required
            type="date"
            value={effectiveFrom}
          />

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

          <label htmlFor="fixed-duration">妆容类型</label>
          <select
            id="fixed-duration"
            onChange={(event) => setDurationMinutes(Number(event.target.value))}
            value={durationMinutes}
          >
            {MAKEUP_TYPE_OPTIONS.map((option) => (
              <option key={option.label} value={option.durationMinutes}>
                {option.label}（{option.durationMinutes}分钟）
              </option>
            ))}
          </select>

          {availability?.unavailableReason ? (
            <p className="form-error">
              {UNAVAILABLE_LABELS[availability.unavailableReason] ?? '当前条件无法设置固定关系'}
            </p>
          ) : null}
          {availableSlots.length > 0 ? (
            <>
              <label>可固定时间</label>
              <div className="slot-grid compact-slots">
                {availableSlots.map((slot) => (
                  <button
                    className={selectedMinute === slot.startMinute ? 'selected' : ''}
                    key={slot.startMinute}
                    onClick={() => {
                      setSelectedMinute(slot.startMinute);
                      if (slot.earliestStartDate && slot.earliestStartDate > effectiveFrom) {
                        setEffectiveFrom(slot.earliestStartDate);
                      }
                    }}
                    type="button"
                  >
                    {minuteLabel(slot.startMinute)}—{minuteLabel(slot.endMinute)}
                    {slot.earliestStartDate && slot.earliestStartDate > effectiveFrom
                      ? ` · 最早 ${slot.earliestStartDate}`
                      : ''}
                  </button>
                ))}
              </div>
            </>
          ) : null}

          <label htmlFor="fixed-reason">{rule ? '修改或取消原因' : '设置原因'}</label>
          <textarea
            id="fixed-reason"
            maxLength={500}
            onChange={(event) => setReason(event.target.value)}
            required
            rows={3}
            value={reason}
          />
          {error ? <p className="form-error">{error}</p> : null}
          <div className="dialog-actions split-actions">
            {rule ? (
              <button
                className="secondary-button danger-text"
                disabled={busy}
                onClick={() => void cancelRule()}
                type="button"
              >
                取消固定关系
              </button>
            ) : (
              <span />
            )}
            <div>
              <button className="secondary-button" disabled={busy} onClick={onClose} type="button">
                关闭
              </button>
              <button
                className="primary-button"
                disabled={busy || selectedMinute === null || weekdays.length === 0}
                type="submit"
              >
                {busy ? '正在保存…' : '确认保存'}
              </button>
            </div>
          </div>
        </form>
      </section>
    </div>
  );
}
