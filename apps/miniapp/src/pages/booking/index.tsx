import { Button, Input, Text, View } from '@tarojs/components';
import Taro, { useDidShow, useRouter } from '@tarojs/taro';
import { useMemo, useState } from 'react';

import {
  createBooking,
  loadBookingPeople,
  loadBookingSlots,
  rescheduleBooking,
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
  const router = useRouter();
  const reschedule =
    router.params.mode === 'reschedule' &&
    typeof router.params.appointmentId === 'string' &&
    typeof router.params.hostId === 'string' &&
    typeof router.params.expectedRowVersion === 'string';
  const dates = useMemo(() => bookingDateOptions(), []);
  const [session, setSession] = useState<SessionTokenPair | null>(null);
  const [hosts, setHosts] = useState<readonly HostSummary[]>([]);
  const [host, setHost] = useState<HostSummary | null>(null);
  const [hostSearch, setHostSearch] = useState('');
  const [artists, setArtists] = useState<readonly ArtistSummary[]>([]);
  const requestedDate =
    typeof router.params.date === 'string' &&
    dates.some((option) => option.date === router.params.date)
      ? router.params.date
      : null;
  const [date, setDate] = useState(requestedDate ?? dates[0]?.date ?? '');
  const [durationMinutes, setDurationMinutes] = useState<(typeof DURATIONS)[number]>(30);
  const [artistId, setArtistId] = useState('');
  const [artistSearch, setArtistSearch] = useState('');
  const [slotResult, setSlotResult] = useState<BookingSlotResult | null>(null);
  const [slot, setSlot] = useState<BookingSlot | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const visibleHosts = useMemo(() => {
    const search = hostSearch.trim().toLocaleLowerCase();
    return search
      ? hosts.filter((item) =>
          `${item.hostCode} ${item.nickname ?? item.realName}`.toLocaleLowerCase().includes(search),
        )
      : hosts;
  }, [hostSearch, hosts]);
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
      if (restored.role.roleCode !== 'HOST' && restored.role.roleCode !== 'OPERATOR') {
        setError('当前角色不能创建预约');
        return;
      }
      const people = await loadBookingPeople(restored.accessToken, date);
      setSession(restored);
      setHosts(people.hosts);
      setHost(
        restored.role.roleCode === 'HOST'
          ? (people.hosts[0] ?? null)
          : reschedule
            ? (people.hosts.find((item) => item.id === router.params.hostId) ?? null)
            : null,
      );
      setArtists(people.artists);
      if (reschedule) await Taro.setNavigationBarTitle({ title: '改期' });
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
          ...(reschedule && router.params.appointmentId
            ? { excludeAppointmentId: router.params.appointmentId }
            : {}),
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

  async function changeDate(nextDate: string): Promise<void> {
    setDate(nextDate);
    clearSelection();
    if (!session) return;
    setBusy(true);
    try {
      const people = await loadBookingPeople(session.accessToken, nextDate);
      setHosts(people.hosts);
      setHost(
        session.role.roleCode === 'HOST'
          ? (people.hosts[0] ?? null)
          : reschedule
            ? (people.hosts.find((item) => item.id === router.params.hostId) ?? null)
            : null,
      );
      setArtists(people.artists);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
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

  function selectHost(nextHost: HostSummary): void {
    setHost(nextHost);
    clearSelection();
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
      if (reschedule && router.params.appointmentId && router.params.expectedRowVersion) {
        await rescheduleBooking({
          appointmentId: router.params.appointmentId,
          artistId,
          confirmedSecondBooking,
          date,
          durationMinutes,
          expectedRowVersion: Number(router.params.expectedRowVersion),
          idempotencyKey,
          startMinute: slot.startMinute,
          token: session.accessToken,
        });
      } else {
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
      }
      await Taro.showModal({
        content: `${date} ${timeLabel(slot.startAt)} ${reschedule ? '已改期成功' : '已预约成功'}`,
        showCancel: false,
        title: reschedule ? '改期成功' : '预约成功',
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
              onClick={() => void changeDate(option.date)}
            >
              <Text>{option.weekday}</Text>
              <Text>{option.day}</Text>
            </Button>
          ))}
        </View>
      </View>

      {session?.role.roleCode === 'OPERATOR' ? (
        <View className="booking-section">
          <Text className="booking-title">{reschedule ? '改期主播' : '选择主播'}</Text>
          {reschedule ? (
            host ? (
              <View className="selected-host">
                <Text>{host.nickname ?? host.realName}</Text>
                <Text className="host-code">{host.hostCode}</Text>
              </View>
            ) : (
              <Text className="booking-note">所选日期你已不再负责该主播，不能代为改期。</Text>
            )
          ) : (
            <>
              <Text className="booking-note">名单按所选日期的负责关系生成，编号用于区分重名。</Text>
              {hosts.length > 8 ? (
                <Input
                  className="person-search"
                  maxlength={50}
                  onInput={(event) => setHostSearch(event.detail.value)}
                  placeholder="搜索主播姓名或编号"
                  value={hostSearch}
                />
              ) : null}
              {!busy && hosts.length === 0 ? (
                <Text className="booking-note">该日期没有由你负责的可预约主播。</Text>
              ) : null}
              <View className="host-list">
                {visibleHosts.map((item) => (
                  <Button
                    className={host?.id === item.id ? 'host-option active' : 'host-option'}
                    key={item.id}
                    onClick={() => selectHost(item)}
                  >
                    <Text>{item.nickname ?? item.realName}</Text>
                    <Text className="host-code">{item.hostCode}</Text>
                  </Button>
                ))}
              </View>
            </>
          )}
        </View>
      ) : null}

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
              disabled={busy || !host}
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
        {busy ? '处理中…' : reschedule ? '确认改期' : '确认预约'}
      </Button>
    </View>
  );
}
