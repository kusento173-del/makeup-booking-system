import { Button, Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useEffect, useMemo, useRef, useState } from 'react';

import { ApiError } from '../../api-client';
import {
  type ArtistSummary,
  type BookingDuration,
  type BookingResult,
  type BookingSlot,
  type BookingSlotResult,
  createBooking,
  getBookingSlots,
  getOwnHost,
  type HostSummary,
  listAvailableArtists,
  listSites,
} from '../../booking-api';
import {
  BOOKING_DURATIONS,
  bookingSignature,
  createIdempotencyKey,
  futureBookingDates,
  slotTime,
  UNAVAILABLE_LABELS,
} from '../../booking-view';
import { restoreSession } from '../../auth-session';
import { PageState } from '../../components/PageState';
import './index.css';

interface PendingAttempt {
  readonly key: string;
  readonly signature: string;
}

const API_ERROR_LABELS: Readonly<Record<string, string>> = {
  BOOKING_ARTIST_UNAVAILABLE: '化妆师的可预约状态已变化，请重新选择。',
  BOOKING_DAILY_LIMIT_REACHED: '当天已经预约两次，不能继续预约。',
  BOOKING_DATE_INVALID: '该日期已不可预约，请重新选择。',
  BOOKING_HOST_UNAVAILABLE: '当前主播在所选日期不能预约。',
  BOOKING_SECOND_CONFIRMATION_REQUIRED: '当天已有一次预约，请确认这是第二次预约。',
  BOOKING_SITE_MISMATCH: '主播与化妆师场地不一致，请重新选择。',
  BOOKING_SLOT_CONFLICT: '该时间刚刚被占用，请重新选择。',
  BOOKING_STATE_CONFLICT: '预约数据已经变化，请刷新后重试。',
};

function errorMessage(cause: unknown): string {
  if (cause instanceof ApiError) return API_ERROR_LABELS[cause.code] ?? cause.message;
  return '操作失败，请稍后重试。';
}

export default function BookingPage() {
  const dates = useMemo(() => futureBookingDates(), []);
  const [token, setToken] = useState('');
  const [host, setHost] = useState<HostSummary | null>(null);
  const [siteName, setSiteName] = useState('');
  const [artists, setArtists] = useState<readonly ArtistSummary[]>([]);
  const [date, setDate] = useState(dates[0]?.date ?? '');
  const [duration, setDuration] = useState<BookingDuration>(30);
  const [artistId, setArtistId] = useState('');
  const [slots, setSlots] = useState<BookingSlotResult | null>(null);
  const [result, setResult] = useState<BookingResult | null>(null);
  const [initialBusy, setInitialBusy] = useState(true);
  const [slotBusy, setSlotBusy] = useState(false);
  const [submitBusy, setSubmitBusy] = useState(false);
  const [initialError, setInitialError] = useState<string | null>(null);
  const [slotError, setSlotError] = useState<string | null>(null);
  const slotRequest = useRef(0);
  const pendingAttempt = useRef<PendingAttempt | null>(null);

  useEffect(() => {
    void initialize();
  }, []);

  async function initialize(): Promise<void> {
    setInitialBusy(true);
    setInitialError(null);
    try {
      const session = await restoreSession();
      if (!session) {
        await Taro.reLaunch({ url: '/pages/index/index' });
        return;
      }
      if (session.role.roleCode !== 'HOST') {
        setInitialError('只有主播本人可以使用此预约入口。');
        return;
      }
      const firstDate = dates[0]?.date;
      if (!firstDate) throw new Error('No booking dates');
      const [ownHost, artistItems, sites] = await Promise.all([
        getOwnHost(session.accessToken, firstDate),
        listAvailableArtists(session.accessToken),
        listSites(session.accessToken),
      ]);
      if (!ownHost) {
        setInitialError('当前账号没有可用的主播档案。');
        return;
      }
      if (ownHost.qualificationStatus !== 'ACTIVE') {
        setInitialError('当前主播预约资格不可用，请联系所属场地客服。');
        return;
      }
      setToken(session.accessToken);
      setHost(ownHost);
      setSiteName(sites.find((site) => site.id === ownHost.siteId)?.name ?? '当前场地');
      setArtists(
        artistItems.filter(
          (artist) => artist.employmentStatus === 'ACTIVE' && artist.initialShiftConfigured,
        ),
      );
    } catch (cause) {
      setInitialError(errorMessage(cause));
    } finally {
      setInitialBusy(false);
    }
  }

  function selectDate(nextDate: string): void {
    setDate(nextDate);
    pendingAttempt.current = null;
    if (artistId) void loadSlots(artistId, nextDate, duration);
  }

  function selectDuration(nextDuration: BookingDuration): void {
    setDuration(nextDuration);
    pendingAttempt.current = null;
    if (artistId) void loadSlots(artistId, date, nextDuration);
  }

  function selectArtist(nextArtistId: string): void {
    setArtistId(nextArtistId);
    pendingAttempt.current = null;
    void loadSlots(nextArtistId, date, duration);
  }

  async function loadSlots(
    nextArtistId: string,
    nextDate: string,
    nextDuration: BookingDuration,
  ): Promise<void> {
    if (!host || !token) return;
    const requestId = ++slotRequest.current;
    setSlotBusy(true);
    setSlotError(null);
    setSlots(null);
    try {
      const response = await getBookingSlots(token, {
        artistId: nextArtistId,
        date: nextDate,
        durationMinutes: nextDuration,
        hostId: host.id,
      });
      if (requestId === slotRequest.current) setSlots(response);
    } catch (cause) {
      if (requestId === slotRequest.current) setSlotError(errorMessage(cause));
    } finally {
      if (requestId === slotRequest.current) setSlotBusy(false);
    }
  }

  async function submit(slot: BookingSlot): Promise<void> {
    if (!host || !slots || !token || submitBusy) return;
    const artist = artists.find((item) => item.id === slots.artistId);
    if (!artist) return;
    const second = slots.requiresSecondConfirmation;
    const confirmation = await Taro.showModal({
      cancelText: '返回检查',
      confirmText: second ? '确认第二次' : '确认预约',
      content: [
        `${host.nickname ?? host.realName}（${host.hostCode}）`,
        `${siteName} · ${artist.nickname}`,
        `${date} ${slotTime(slot)} · ${duration}分钟`,
        ...(second ? ['这是当天第二次预约，一天最多两次。'] : []),
      ].join('\n'),
      title: second ? '确认第二次预约' : '确认预约信息',
    });
    if (!confirmation.confirm) return;

    const input = {
      artistId: artist.id,
      date,
      durationMinutes: duration,
      startMinute: slot.startMinute,
    };
    const signature = bookingSignature(input);
    const attempt =
      pendingAttempt.current?.signature === signature
        ? pendingAttempt.current
        : { key: createIdempotencyKey(), signature };
    pendingAttempt.current = attempt;
    setSubmitBusy(true);
    setSlotError(null);
    try {
      const created = await createBooking(
        token,
        {
          ...input,
          confirmedSecondBooking: second,
          hostId: host.id,
        },
        attempt.key,
      );
      pendingAttempt.current = null;
      setResult(created);
    } catch (cause) {
      setSlotError(errorMessage(cause));
      if (
        cause instanceof ApiError &&
        ['BOOKING_SECOND_CONFIRMATION_REQUIRED', 'BOOKING_SLOT_CONFLICT'].includes(cause.code)
      ) {
        pendingAttempt.current = null;
        await loadSlots(artist.id, date, duration);
      }
    } finally {
      setSubmitBusy(false);
    }
  }

  if (initialBusy) {
    return (
      <View className="booking-page">
        <PageState kind="LOADING" message="正在读取主播和化妆师资料。" />
      </View>
    );
  }
  if (initialError) {
    return (
      <View className="booking-page">
        <PageState
          actionLabel="返回首页"
          kind="UNAUTHORIZED"
          message={initialError}
          onAction={() => void Taro.reLaunch({ url: '/pages/index/index' })}
        />
      </View>
    );
  }
  if (!host) return null;

  if (result) {
    const appointment = result.appointment;
    return (
      <View className="booking-page">
        <View className="booking-success">
          <Text className="success-title">预约成功</Text>
          <Text className="success-time">
            {appointment.date} {slotTime(appointment)}
          </Text>
          <Text className="success-detail">
            {appointment.siteName} · {appointment.artistNickname} · {appointment.durationMinutes}
            分钟
          </Text>
          <Text className="success-note">
            {appointment.dailySequence === 2 ? '这是当天第二次预约。' : '档期已经为你保留。'}
          </Text>
          <Button
            className="primary-action"
            onClick={() => void Taro.redirectTo({ url: '/pages/schedule/index' })}
          >
            查看我的排班
          </Button>
        </View>
      </View>
    );
  }

  const selectedArtist = artists.find((artist) => artist.id === artistId);
  const unavailable = slots?.unavailableReason
    ? (UNAVAILABLE_LABELS[slots.unavailableReason] ?? '该日期暂无可预约时间')
    : null;

  return (
    <View className="booking-page">
      <View className="booking-summary">
        <Text className="summary-name">{host.nickname ?? host.realName}</Text>
        <Text className="summary-meta">
          {host.hostCode} · {siteName}
        </Text>
      </View>

      <View className="booking-section">
        <Text className="section-title">1. 选择日期</Text>
        <View className="date-grid">
          {dates.map((option) => (
            <Button
              className={date === option.date ? 'option-button active' : 'option-button'}
              key={option.date}
              onClick={() => selectDate(option.date)}
              size="mini"
            >
              <Text>{option.label}</Text>
              <Text className="option-subtitle">{option.date.slice(5)}</Text>
            </Button>
          ))}
        </View>
      </View>

      <View className="booking-section">
        <Text className="section-title">2. 选择时长</Text>
        <Text className="section-note">默认 30 分钟；需要约 40 分钟的妆请选择 45 分钟。</Text>
        <View className="duration-row">
          {BOOKING_DURATIONS.map((minutes) => (
            <Button
              className={duration === minutes ? 'option-button active' : 'option-button'}
              key={minutes}
              onClick={() => selectDuration(minutes)}
              size="mini"
            >
              {minutes} 分钟
            </Button>
          ))}
        </View>
      </View>

      <View className="booking-section">
        <Text className="section-title">3. 选择化妆师</Text>
        {artists.length === 0 ? (
          <Text className="section-note">当前场地暂无已设置班次的化妆师。</Text>
        ) : (
          <View className="artist-grid">
            {artists.map((artist) => (
              <Button
                className={artistId === artist.id ? 'artist-button active' : 'artist-button'}
                key={artist.id}
                onClick={() => selectArtist(artist.id)}
                size="mini"
              >
                {artist.nickname}
              </Button>
            ))}
          </View>
        )}
      </View>

      {selectedArtist ? (
        <View className="booking-section">
          <Text className="section-title">4. 选择时间</Text>
          <Text className="section-note">
            {selectedArtist.nickname} · {date} · {duration} 分钟
          </Text>
          {slotBusy ? <Text className="inline-state">正在查询最新空闲时间…</Text> : null}
          {slots?.requiresSecondConfirmation ? (
            <View className="second-warning">
              当天已有一次预约。本次将是第二次预约，一天最多两次。
            </View>
          ) : null}
          {unavailable ? <View className="inline-error">{unavailable}</View> : null}
          {slotError ? <View className="inline-error">{slotError}</View> : null}
          {!slotBusy && slots && !unavailable && slots.slots.length === 0 ? (
            <Text className="inline-state">该时长暂无空闲时间，请更换化妆师或时长。</Text>
          ) : null}
          {slots && slots.slots.length > 0 ? (
            <View className="slot-grid">
              {slots.slots.map((slot) => (
                <Button
                  className="slot-button"
                  disabled={submitBusy}
                  key={slot.startMinute}
                  onClick={() => void submit(slot)}
                  size="mini"
                >
                  {slotTime(slot)}
                </Button>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
