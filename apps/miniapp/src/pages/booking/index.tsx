import { Button, Input, Text, View } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { useMemo, useState } from 'react';

import {
  createBooking,
  loadBookingPeople,
  loadBookingSlots,
  type ArtistSummary,
  type BookingSlot,
  type BookingSlotResult,
  type HostSummary,
} from '../../booking-api';
import { bookingDateOptions, createIdempotencyKey } from '../../booking-view';
import { ApiError } from '../../api-client';
import { restoreSession, type SessionTokenPair } from '../../auth-session';
import './index.css';

const DURATIONS = [15, 30, 45, 60] as const;
const UNAVAILABLE_MESSAGES: Readonly<Record<string, string>> = {
  ARTIST_NOT_WORKING: '该化妆师当天不工作。',
  ARTIST_ON_LEAVE: '该化妆师当天请假。',
  HOST_DAILY_LIMIT_REACHED: '你当天已经有两次有效预约，不能继续预约。',
  HOST_INELIGIBLE: '你的预约资格当前不可用。',
  HOST_ON_LEAVE: '你当天处于请假状态，不能预约。',
  HOST_SITE_INACTIVE: '所属场地当前不可预约。',
  SHIFT_NOT_CONFIGURED: '该化妆师尚未设置班次。',
};

function errorMessage(cause: unknown): string {
  if (cause instanceof ApiError) return cause.message;
  return '操作失败，请稍后重试';
}

function timeLabel(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    hour12: false,
    minute: '2-digit',
    timeZone: 'Asia/Shanghai',
  }).format(new Date(value));
}

export default function BookingPage() {
  const dates = useMemo(() => bookingDateOptions(), []);
  const [session, setSession] = useState<SessionTokenPair | null>(null);
  const [host, setHost] = useState<HostSummary | null>(null);
  const [artists, setArtists] = useState<readonly ArtistSummary[]>([]);
  const [date, setDate] = useState(dates[0]?.date ?? '');
  const [durationMinutes, setDurationMinutes] = useState<(typeof DURATIONS)[number]>(30);
  const [artistId, setArtistId] = useState('');
  const [artistSearch, setArtistSearch] = useState('');
  const [slotResult, setSlotResult] = useState<BookingSlotResult | null>(null);
  const [slot, setSlot] = useState<BookingSlot | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const visibleArtists = useMemo(() => {
    const search = artistSearch.trim().toLocaleLowerCase();
    return search
      ? artists.filter((artist) => artist.nickname.toLocaleLowerCase().includes(search))
      : artists;
  }, [artistSearch, artists]);

  useDidShow(() => {
    void initialize();
  });

  async function initialize(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const restored = await restoreSession();
      if (!restored) {
        await Taro.reLaunch({ url: '/pages/index/index' });
        return;
      }
      if (restored.role.roleCode !== 'HOST') {
        setError('当前页面仅供主播本人预约');
        return;
      }
      const people = await loadBookingPeople(restored.accessToken, date);
      setSession(restored);
      setHost(people.host);
      setArtists(people.artists);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  async function selectArtist(nextArtistId: string): Promise<void> {
    if (!session || !host) return;
    setArtistId(nextArtistId);
    setSlot(null);
    setIdempotencyKey('');
    setSlotResult(null);
    setBusy(true);
    setError(null);
    try {
      setSlotResult(
        await loadBookingSlots({
          artistId: nextArtistId,
          date,
          durationMinutes,
          hostId: host.id,
          token: session.accessToken,
        }),
      );
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  function changeDate(nextDate: string): void {
    setDate(nextDate);
    clearSelection();
  }

  function changeDuration(nextDuration: (typeof DURATIONS)[number]): void {
    setDurationMinutes(nextDuration);
    clearSelection();
  }

  function clearSelection(): void {
    setArtistId('');
    setSlot(null);
    setIdempotencyKey('');
    setSlotResult(null);
    setError(null);
  }

  async function submit(): Promise<void> {
    if (!session || !host || !artistId || !slot || !slotResult || !idempotencyKey) {
      setError('请先选择化妆师和预约时间');
      return;
    }
    let confirmedSecondBooking = false;
    if (slotResult.requiresSecondConfirmation) {
      const confirmation = await Taro.showModal({
        cancelText: '返回检查',
        confirmText: '确认第二次',
        content: '这是该主播当天第二次化妆预约。一天最多两次，是否继续？',
        title: '第二次预约提醒',
      });
      if (!confirmation.confirm) return;
      confirmedSecondBooking = true;
    }
    setBusy(true);
    setError(null);
    try {
      await createBooking({
        artistId,
        confirmedSecondBooking,
        date,
        durationMinutes,
        hostId: host.id,
        idempotencyKey,
        startMinute: slot.startMinute,
        token: session.accessToken,
      });
      await Taro.showModal({
        content: `${date} ${timeLabel(slot.startAt)} 已预约成功`,
        showCancel: false,
        title: '预约成功',
      });
      await Taro.navigateBack();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View className="booking-page">
      <View className="booking-section">
        <Text className="booking-title">选择日期</Text>
        <View className="date-grid">
          {dates.map((option) => (
            <Button
              className={date === option.date ? 'date-option active' : 'date-option'}
              key={option.date}
              onClick={() => changeDate(option.date)}
            >
              <Text>{option.weekday}</Text>
              <Text>{option.day}</Text>
            </Button>
          ))}
        </View>
      </View>

      <View className="booking-section">
        <Text className="booking-title">化妆时长</Text>
        <Text className="booking-note">默认 30 分钟；复杂妆容请选择 45 分钟。</Text>
        <View className="duration-row">
          {DURATIONS.map((duration) => (
            <Button
              className={durationMinutes === duration ? 'duration active' : 'duration'}
              key={duration}
              onClick={() => changeDuration(duration)}
              size="mini"
            >
              {duration} 分钟
            </Button>
          ))}
        </View>
      </View>

      <View className="booking-section">
        <Text className="booking-title">选择化妆师</Text>
        {!busy && artists.length === 0 ? (
          <Text className="booking-note">当前场地暂无已设置班次的可预约化妆师。</Text>
        ) : null}
        {artists.length > 8 ? (
          <Input
            className="artist-search"
            maxlength={40}
            onInput={(event) => setArtistSearch(event.detail.value)}
            placeholder="搜索化妆师昵称"
            value={artistSearch}
          />
        ) : null}
        <View className="artist-grid">
          {visibleArtists.map((artist) => (
            <Button
              className={artistId === artist.id ? 'artist active' : 'artist'}
              disabled={busy}
              key={artist.id}
              onClick={() => void selectArtist(artist.id)}
            >
              {artist.nickname}
            </Button>
          ))}
        </View>
      </View>

      {artistId ? (
        <View className="booking-section">
          <Text className="booking-title">选择时间</Text>
          {busy ? <Text className="booking-note">正在查询实时空闲时间…</Text> : null}
          {!busy && slotResult?.slots.length === 0 ? (
            <Text className="booking-note">
              {slotResult.unavailableReason
                ? (UNAVAILABLE_MESSAGES[slotResult.unavailableReason] ??
                  '当前条件下没有可预约时间。')
                : '该化妆师当天没有符合时长的空闲时间。'}
            </Text>
          ) : null}
          <View className="slot-grid">
            {slotResult?.slots.map((item) => (
              <Button
                className={slot?.startMinute === item.startMinute ? 'slot active' : 'slot'}
                key={item.startMinute}
                onClick={() => {
                  setSlot(item);
                  setIdempotencyKey(createIdempotencyKey());
                }}
                size="mini"
              >
                {timeLabel(item.startAt)}
              </Button>
            ))}
          </View>
        </View>
      ) : null}

      {error ? (
        <View className="booking-error" role="alert">
          {error}
        </View>
      ) : null}
      <Button className="submit-booking" disabled={busy || !slot} onClick={() => void submit()}>
        {busy ? '处理中…' : '确认预约'}
      </Button>
    </View>
  );
}
