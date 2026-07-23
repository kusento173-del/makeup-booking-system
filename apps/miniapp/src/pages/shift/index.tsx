import { Button, Picker, Switch, Text, View } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { useState } from 'react';

import { ApiError } from '../../api-client';
import { restoreSession } from '../../auth-session';
import {
  loadArtistShiftContext,
  setInitialShift,
  type ArtistIdentity,
  type ArtistShift,
} from '../../shift-api';
import { minuteToTime, timeToMinute, validateShiftTimes, workdayText } from '../../shift-view';
import './index.css';

const WEEKDAYS = [
  { label: '一', value: 1 },
  { label: '二', value: 2 },
  { label: '三', value: 3 },
  { label: '四', value: 4 },
  { label: '五', value: 5 },
  { label: '六', value: 6 },
  { label: '日', value: 7 },
] as const;

function errorMessage(cause: unknown): string {
  if (cause instanceof ApiError) return cause.message;
  return '班次操作失败，请稍后重试';
}

export default function ShiftPage() {
  const [artist, setArtist] = useState<ArtistIdentity | null>(null);
  const [shift, setShift] = useState<ArtistShift | null>(null);
  const [token, setToken] = useState('');
  const [workdays, setWorkdays] = useState<readonly number[]>([1, 2, 3, 4, 5]);
  const [workStart, setWorkStart] = useState('09:00');
  const [breakEnabled, setBreakEnabled] = useState(true);
  const [breakStart, setBreakStart] = useState('12:00');
  const [breakEnd, setBreakEnd] = useState('13:00');
  const [workEnd, setWorkEnd] = useState('18:00');
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useDidShow(() => {
    void load();
  });

  async function load(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const session = await restoreSession();
      if (!session) {
        await Taro.reLaunch({ url: '/pages/index/index' });
        return;
      }
      if (session.role.roleCode !== 'ARTIST') {
        setError('当前页面仅供化妆师使用');
        return;
      }
      const context = await loadArtistShiftContext(session.accessToken);
      setToken(session.accessToken);
      setArtist(context.artist);
      setShift(context.shift);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  function toggleWorkday(weekday: number): void {
    setWorkdays((current) =>
      current.includes(weekday)
        ? current.filter((value) => value !== weekday)
        : [...current, weekday].sort((left, right) => left - right),
    );
  }

  async function submit(): Promise<void> {
    if (!artist || !token) return;
    if (workdays.length === 0) {
      setError('请至少选择一个工作日');
      return;
    }
    const times = {
      breakEndMinute: breakEnabled ? timeToMinute(breakEnd) : null,
      breakStartMinute: breakEnabled ? timeToMinute(breakStart) : null,
      workEndMinute: timeToMinute(workEnd),
      workStartMinute: timeToMinute(workStart),
    };
    const validationError = validateShiftTimes(times);
    if (validationError) {
      setError(validationError);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const saved = await setInitialShift({
        artistId: artist.id,
        breakEndMinute: times.breakEndMinute,
        breakStartMinute: times.breakStartMinute,
        token,
        workEndMinute: times.workEndMinute,
        workStartMinute: times.workStartMinute,
        workdays,
      });
      setShift(saved);
      await Taro.showToast({ icon: 'success', title: '班次已设置' });
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View className="shift-page">
      {busy ? <View className="shift-state">正在读取班次…</View> : null}
      {error ? (
        <View className="shift-state error" role="alert">
          {error}
        </View>
      ) : null}
      {!busy && !error && !artist ? (
        <View className="shift-state" role="status">
          当前账号尚未关联化妆师档案，请联系所属场地客服处理。
        </View>
      ) : null}

      {!busy && artist && shift ? (
        <View className="shift-card">
          <Text className="shift-title">{artist.nickname}的固定班次</Text>
          <View className="shift-row">
            <Text>工作日</Text>
            <Text>{workdayText(shift.workdays)}</Text>
          </View>
          <View className="shift-row">
            <Text>上班时间</Text>
            <Text>{minuteToTime(shift.workStartMinute)}</Text>
          </View>
          <View className="shift-row">
            <Text>午休时间</Text>
            <Text>
              {shift.breakStartMinute === null || shift.breakEndMinute === null
                ? '不设午休'
                : `${minuteToTime(shift.breakStartMinute)}–${minuteToTime(shift.breakEndMinute)}`}
            </Text>
          </View>
          <View className="shift-row">
            <Text>下班时间</Text>
            <Text>{minuteToTime(shift.workEndMinute)}</Text>
          </View>
          <Text className="shift-note">后续修改班次需要提交申请，由所属场地客服审核。</Text>
        </View>
      ) : null}

      {!busy && artist && !shift ? (
        <View className="shift-card">
          <Text className="shift-title">首次设置班次</Text>
          <Text className="shift-note">未设置前无法被预约。所有时间必须是 15 分钟粒度。</Text>

          <Text className="field-title">每周工作日</Text>
          <View className="weekday-row">
            {WEEKDAYS.map((weekday) => (
              <Button
                className={workdays.includes(weekday.value) ? 'weekday active' : 'weekday'}
                key={weekday.value}
                onClick={() => toggleWorkday(weekday.value)}
                size="mini"
              >
                {weekday.label}
              </Button>
            ))}
          </View>

          <TimeField label="上班时间" onChange={setWorkStart} value={workStart} />
          <View className="switch-row">
            <Text>设置午休</Text>
            <Switch
              checked={breakEnabled}
              color="#245c6d"
              onChange={(event) => setBreakEnabled(event.detail.value)}
            />
          </View>
          {breakEnabled ? (
            <>
              <TimeField label="午休开始" onChange={setBreakStart} value={breakStart} />
              <TimeField label="午休结束" onChange={setBreakEnd} value={breakEnd} />
            </>
          ) : null}
          <TimeField label="下班时间" onChange={setWorkEnd} value={workEnd} />

          <Button className="save-shift" disabled={busy} onClick={() => void submit()}>
            保存班次
          </Button>
        </View>
      ) : null}
    </View>
  );
}

function TimeField(props: {
  readonly label: string;
  readonly onChange: (value: string) => void;
  readonly value: string;
}) {
  return (
    <View className="time-field">
      <Text>{props.label}</Text>
      <Picker
        end="23:45"
        mode="time"
        onChange={(event) => props.onChange(String(event.detail.value))}
        start="00:00"
        value={props.value}
      >
        <View className="time-value">{props.value}</View>
      </Picker>
    </View>
  );
}
