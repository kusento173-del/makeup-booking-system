import { useCallback, useEffect, useMemo, useState } from 'react';

import { ApiError } from './api-client';
import type { SessionTokenPair } from './auth-session';
import {
  type BookingDuration,
  type BookingSlot,
  type BookingSlots,
  createAppointment,
  getBookingSlots,
  listArtists,
  listHosts,
  type MobileAppointment,
  type MobileArtist,
  type MobileHost,
  rescheduleAppointment,
} from './mobile-api';
import { MAKEUP_TYPE_OPTIONS, makeupTypeLabel } from './makeup-type';
import { bookingDates, minuteLabel } from './mobile-utils';

interface MobileBookingProps {
  readonly appointment?: MobileAppointment | null;
  readonly initialHostId?: string;
  readonly onCompleted: () => void;
  readonly session: SessionTokenPair;
}

export function MobileBooking({
  appointment,
  initialHostId,
  onCompleted,
  session,
}: MobileBookingProps) {
  const dates = useMemo(bookingDates, []);
  const [date, setDate] = useState(dates[0]?.date ?? '');
  const [duration, setDuration] = useState<BookingDuration>(30);
  const [hosts, setHosts] = useState<readonly MobileHost[]>([]);
  const [hostId, setHostId] = useState(appointment?.hostId ?? initialHostId ?? '');
  const [artists, setArtists] = useState<readonly MobileArtist[]>([]);
  const [artistId, setArtistId] = useState('');
  const [slots, setSlots] = useState<BookingSlots | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPeople = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const [hostPage, artistPage] = await Promise.all([
        listHosts(session.accessToken, date),
        listArtists(session.accessToken),
      ]);
      setHosts(hostPage.items);
      setArtists(
        artistPage.items.filter(
          (artist) => artist.employmentStatus === 'ACTIVE' && artist.initialShiftConfigured,
        ),
      );
      if (session.role.roleCode === 'HOST') {
        setHostId(hostPage.items[0]?.id ?? '');
      } else if (appointment) {
        setHostId(appointment.hostId);
      }
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : '人员资料读取失败');
    } finally {
      setBusy(false);
    }
  }, [appointment, date, session.accessToken, session.role.roleCode]);

  useEffect(() => {
    void loadPeople();
  }, [loadPeople]);

  useEffect(() => {
    setSlots(null);
    if (!artistId || !hostId || !date) return;
    let active = true;
    setBusy(true);
    setError(null);
    void getBookingSlots(session.accessToken, {
      artistId,
      date,
      durationMinutes: duration,
      ...(appointment ? { excludeAppointmentId: appointment.id } : {}),
      hostId,
    })
      .then((result) => active && setSlots(result))
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof ApiError ? cause.message : '空闲时间读取失败');
      })
      .finally(() => active && setBusy(false));
    return () => {
      active = false;
    };
  }, [appointment, artistId, date, duration, hostId, session.accessToken]);

  function changeDate(nextDate: string) {
    setDate(nextDate);
    if (session.role.roleCode === 'OPERATOR' && !appointment) setHostId('');
    setArtistId('');
    setSlots(null);
  }

  async function submit(slot: BookingSlot) {
    const host = hosts.find((item) => item.id === hostId);
    const artist = artists.find((item) => item.id === artistId);
    if (!host || !artist || !slots) return;
    const secondNotice = slots.requiresSecondConfirmation
      ? '\n这是该主播当天第二次预约，一天最多两次。'
      : '';
    if (
      !window.confirm(
        `${appointment ? '确认改期' : '确认预约'}\n${host.realName}（${host.hostCode}）\n${
          artist.nickname
        } · ${date} ${minuteLabel(slot.startMinute)} · ${makeupTypeLabel(duration)}${secondNotice}`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const input = {
        artistId,
        confirmedSecondBooking: slots.requiresSecondConfirmation,
        date,
        durationMinutes: duration,
        startMinute: slot.startMinute,
      };
      if (appointment) {
        await rescheduleAppointment(session.accessToken, appointment.id, {
          ...input,
          expectedRowVersion: appointment.rowVersion,
        });
      } else {
        await createAppointment(session.accessToken, { ...input, hostId });
      }
      onCompleted();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : '预约失败，请重新选择时间');
      setBusy(false);
    }
  }

  const selectedHost = hosts.find((item) => item.id === hostId);

  return (
    <section className="mobile-view">
      <header className="mobile-section-header">
        <div>
          <p className="eyebrow">{appointment ? '调整预约' : '预约'}</p>
          <h1>
            {appointment
              ? '预约改期'
              : session.role.roleCode === 'OPERATOR'
                ? '代主播预约'
                : '预约化妆'}
          </h1>
        </div>
      </header>
      <div className="mobile-form-section">
        <h2>1. 选择日期</h2>
        <div className="choice-grid">
          {dates.map((item) => (
            <button
              className={date === item.date ? 'active' : ''}
              key={item.date}
              onClick={() => changeDate(item.date)}
              type="button"
            >
              {item.label}
              <small>{item.date.slice(5)}</small>
            </button>
          ))}
        </div>
      </div>

      {session.role.roleCode === 'OPERATOR' ? (
        <div className="mobile-form-section">
          <h2>2. 选择负责主播</h2>
          <select
            disabled={Boolean(appointment)}
            onChange={(event) => {
              setHostId(event.target.value);
              setArtistId('');
            }}
            value={hostId}
          >
            <option value="">请选择</option>
            {hosts.map((host) => (
              <option key={host.id} value={host.id}>
                {host.realName} · {host.hostCode}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {selectedHost ? (
        <>
          <div className="mobile-form-section">
            <h2>{session.role.roleCode === 'OPERATOR' ? '3' : '2'}. 选择妆容</h2>
            <div className="choice-grid compact">
              {MAKEUP_TYPE_OPTIONS.map((option) => (
                <button
                  className={duration === option.durationMinutes ? 'active' : ''}
                  key={option.label}
                  onClick={() => setDuration(option.durationMinutes)}
                  type="button"
                >
                  {option.label}
                  <small>{option.durationMinutes} 分钟</small>
                </button>
              ))}
            </div>
          </div>
          <div className="mobile-form-section">
            <h2>{session.role.roleCode === 'OPERATOR' ? '4' : '3'}. 选择化妆师</h2>
            <select onChange={(event) => setArtistId(event.target.value)} value={artistId}>
              <option value="">请选择</option>
              {artists.map((artist) => (
                <option key={artist.id} value={artist.id}>
                  {artist.nickname}
                </option>
              ))}
            </select>
          </div>
        </>
      ) : null}

      {artistId ? (
        <div className="mobile-form-section">
          <h2>{session.role.roleCode === 'OPERATOR' ? '5' : '4'}. 选择时间</h2>
          {slots?.requiresSecondConfirmation ? (
            <p className="warning-box">当天已有一次预约，本次为第二次预约。</p>
          ) : null}
          {slots?.unavailableReason ? (
            <p className="mobile-state">所选日期暂无可预约时间，请更换日期或化妆师。</p>
          ) : null}
          <div className="slot-grid">
            {slots?.slots.map((slot) => (
              <button
                disabled={busy}
                key={slot.startMinute}
                onClick={() => void submit(slot)}
                type="button"
              >
                {minuteLabel(slot.startMinute)}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {busy ? <p className="mobile-state">正在同步可预约时间…</p> : null}
      {error ? <p className="form-error">{error}</p> : null}
    </section>
  );
}
