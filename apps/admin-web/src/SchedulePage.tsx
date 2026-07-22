import { useEffect, useMemo, useState } from 'react';

import { ApiError } from './api-client';
import type { SessionTokenPair } from './auth-session';
import { addBusinessDays, businessDateLabel, currentBusinessDate } from './business-date';
import { listSites, type SiteSummary } from './master-data-api';
import {
  getScheduleBoard,
  type MinuteInterval,
  type ScheduleBoard,
  type ScheduleUnavailableReason,
} from './schedule-board-api';

interface SchedulePageProps {
  readonly onUnauthorized: () => void;
  readonly session: SessionTokenPair;
}

const UNAVAILABLE_LABELS: Record<ScheduleUnavailableReason, string> = {
  ARTIST_INACTIVE: '化妆师已停用',
  ARTIST_ON_LEAVE: '化妆师请假',
  NON_WORKING_DAY: '非工作日',
  SHIFT_NOT_CONFIGURED: '未设置班次',
  SITE_INACTIVE: '场地已停用',
};

function minuteLabel(minute: number): string {
  const hour = Math.floor(minute / 60);
  const remainder = minute % 60;
  return `${String(hour).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

function intervalLabel(interval: MinuteInterval): string {
  return `${minuteLabel(interval.startMinute)}–${minuteLabel(interval.endMinute)}`;
}

function updatedAtLabel(instant: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    hour12: false,
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'Asia/Shanghai',
  }).format(new Date(instant));
}

export function SchedulePage({ onUnauthorized, session }: SchedulePageProps) {
  const today = useMemo(() => currentBusinessDate(), []);
  const quickDates = useMemo(
    () => Array.from({ length: 8 }, (_, index) => addBusinessDays(today, index)),
    [today],
  );
  const [date, setDate] = useState(today);
  const [sites, setSites] = useState<readonly SiteSummary[]>([]);
  const [siteId, setSiteId] = useState(session.role.siteId ?? '');
  const [board, setBoard] = useState<ScheduleBoard | null>(null);
  const [loadingSites, setLoadingSites] = useState(session.role.roleCode === 'ADMIN');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadVersion, setReloadVersion] = useState(0);

  useEffect(() => {
    if (session.role.roleCode !== 'ADMIN') {
      return;
    }
    let active = true;
    setLoadingSites(true);
    void listSites(session.accessToken)
      .then((result) => {
        if (!active) {
          return;
        }
        setSites(result);
        setSiteId(
          (current) => current || result.find((site) => site.status === 'ACTIVE')?.id || '',
        );
      })
      .catch((cause: unknown) => {
        if (!active) {
          return;
        }
        if (cause instanceof ApiError && cause.status === 401) {
          onUnauthorized();
          return;
        }
        setError(cause instanceof ApiError ? cause.message : '场地加载失败，请稍后重试');
      })
      .finally(() => active && setLoadingSites(false));
    return () => {
      active = false;
    };
  }, [onUnauthorized, session.accessToken, session.role.roleCode]);

  useEffect(() => {
    if (session.role.roleCode === 'ADMIN' && !siteId) {
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    void getScheduleBoard(
      session.accessToken,
      date,
      session.role.roleCode === 'ADMIN' ? siteId : undefined,
    )
      .then((result) => active && setBoard(result))
      .catch((cause: unknown) => {
        if (!active) {
          return;
        }
        if (cause instanceof ApiError && cause.status === 401) {
          onUnauthorized();
          return;
        }
        setBoard(null);
        setError(cause instanceof ApiError ? cause.message : '排班加载失败，请稍后重试');
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [date, onUnauthorized, reloadVersion, session.accessToken, session.role.roleCode, siteId]);

  return (
    <main className="management-main schedule-main">
      <header className="schedule-header">
        <div>
          <p className="eyebrow">排班管理</p>
          <h1>排班看板</h1>
        </div>
        <div className="schedule-filters">
          {session.role.roleCode === 'ADMIN' ? (
            <label className="compact-field">
              <span>场地</span>
              <select
                disabled={loadingSites}
                onChange={(event) => setSiteId(event.target.value)}
                value={siteId}
              >
                {sites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.name}
                    {site.status === 'INACTIVE' ? '（已停用）' : ''}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="compact-field">
            <span>指定日期</span>
            <input
              max={addBusinessDays(today, 7)}
              onChange={(event) => setDate(event.target.value)}
              type="date"
              value={date}
            />
          </label>
          <button
            className="secondary-button schedule-refresh"
            disabled={loading}
            onClick={() => setReloadVersion((value) => value + 1)}
            type="button"
          >
            刷新
          </button>
        </div>
      </header>

      <div className="date-strip" aria-label="未来七日快捷日期">
        {quickDates.map((quickDate, index) => (
          <button
            aria-pressed={quickDate === date}
            key={quickDate}
            onClick={() => setDate(quickDate)}
            type="button"
          >
            <span>
              {index === 0 ? '今天' : index === 1 ? '明天' : businessDateLabel(quickDate)}
            </span>
            <strong>{quickDate.slice(5).replace('-', '/')}</strong>
          </button>
        ))}
      </div>

      <section className="schedule-board" aria-busy={loading}>
        <div className="schedule-summary">
          <strong>{board ? `${board.siteName} · ${board.date}` : '排班数据'}</strong>
          <span>
            {loading
              ? '正在加载…'
              : board
                ? `${board.artists.length} 名化妆师 · 更新于 ${updatedAtLabel(board.lastUpdatedAt)}`
                : '尚未加载'}
          </span>
        </div>

        {error ? (
          <div className="content-message error-message">
            <p>{error}</p>
            <button
              className="secondary-button"
              onClick={() => setReloadVersion((value) => value + 1)}
              type="button"
            >
              重新加载
            </button>
          </div>
        ) : null}

        {!error && !loading && board?.artists.length === 0 ? (
          <div className="content-message">该场地暂无化妆师或排班记录</div>
        ) : null}

        {!error && board && board.artists.length > 0 ? (
          <div className={`schedule-grid${loading ? ' is-refreshing' : ''}`}>
            <div className="schedule-grid-header">
              <span>化妆师</span>
              <span>可排班时间</span>
              <span>当日预约（按开始时间排序）</span>
            </div>
            {board.artists.map((artist) => (
              <article className="artist-schedule-row" key={artist.artistId}>
                <div className="artist-summary">
                  <strong>{artist.artistNickname}</strong>
                  <span>{artist.appointments.length} 个预约</span>
                  {artist.availabilitySource === 'APPROVED_OVERTIME' ? <em>加班</em> : null}
                </div>
                <div className="artist-availability">
                  {artist.available ? (
                    <>
                      <strong>{artist.workIntervals.map(intervalLabel).join('、')}</strong>
                      {artist.breakInterval ? (
                        <span>休息 {intervalLabel(artist.breakInterval)}</span>
                      ) : (
                        <span>无休息时段</span>
                      )}
                    </>
                  ) : (
                    <strong className="unavailable-text">
                      {artist.unavailableReason
                        ? UNAVAILABLE_LABELS[artist.unavailableReason]
                        : '当天不可排班'}
                    </strong>
                  )}
                </div>
                <div className="appointment-list">
                  {artist.appointments.length === 0 ? (
                    <span className="empty-appointments">暂无预约</span>
                  ) : (
                    artist.appointments.map((appointment) => (
                      <div
                        className={`appointment-card ${appointment.appointmentType.toLowerCase()}${appointment.status === 'COMPLETED' ? ' completed' : ''}`}
                        key={appointment.id}
                      >
                        <div className="appointment-time">
                          <strong>
                            {minuteLabel(appointment.startMinute)}–
                            {minuteLabel(appointment.endMinute)}
                          </strong>
                          <span>{appointment.appointmentType === 'FIXED' ? '固定' : '单次'}</span>
                        </div>
                        <div className="appointment-host">
                          <strong>{appointment.hostName}</strong>
                          <span>{appointment.hostCode}</span>
                        </div>
                        <div className="appointment-meta">
                          <span>{appointment.durationMinutes}分钟</span>
                          {appointment.dailySequence === 2 ? <span>第2次</span> : null}
                          {appointment.operatorName ? (
                            <span>运营 {appointment.operatorName}</span>
                          ) : null}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </section>
    </main>
  );
}
