import { Button, Picker, Text, Textarea, View } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { useState } from 'react';

import { ApiError } from '../../api-client';
import { restoreSession } from '../../auth-session';
import { PageState } from '../../components/PageState';
import {
  cancelUnavailablePeriod,
  createUnavailablePeriod,
  type ArtistUnavailablePeriodPreview,
  type ArtistUnavailablePeriodSummary,
  listOwnUnavailablePeriods,
  previewUnavailablePeriod,
} from '../../unavailability-api';
import './index.css';

const START_OPTIONS = Array.from({ length: 96 }, (_, index) => index * 15);
const END_OPTIONS = Array.from({ length: 96 }, (_, index) => (index + 1) * 15);

function futureDateValue(days: number, now = new Date()): string {
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function minuteLabel(minute: number): string {
  if (minute === 1440) return '24:00';
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}

function errorMessage(cause: unknown): string {
  return cause instanceof ApiError ? cause.message : '临时不可排班操作失败，请稍后重试。';
}

export default function UnavailabilityPage() {
  const [token, setToken] = useState('');
  const [periods, setPeriods] = useState<readonly ArtistUnavailablePeriodSummary[]>([]);
  const [date, setDate] = useState(() => futureDateValue(1));
  const [startMinute, setStartMinute] = useState(840);
  const [endMinute, setEndMinute] = useState(900);
  const [reason, setReason] = useState('');
  const [preview, setPreview] = useState<ArtistUnavailablePeriodPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useDidShow(() => {
    void load();
  });

  async function load(): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const session = await restoreSession();
      if (!session) {
        await Taro.reLaunch({ url: '/pages/index/index' });
        return;
      }
      if (session.role.roleCode !== 'ARTIST') {
        setError('只有化妆师可以设置本人临时不可排班时间。');
        return;
      }
      setToken(session.accessToken);
      setPeriods(await listOwnUnavailablePeriods(session.accessToken));
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }

  function resetPreview(): void {
    setPreview(null);
    setError(null);
  }

  async function previewImpact(): Promise<void> {
    if (!token || busy) return;
    if (endMinute <= startMinute) {
      setError('结束时间必须晚于开始时间。');
      return;
    }
    if (!reason.trim()) {
      setError('请填写不可排班原因。');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setPreview(
        await previewUnavailablePeriod(token, {
          endMinute,
          startMinute,
          unavailableDate: date,
        }),
      );
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  async function submit(): Promise<void> {
    if (!token || !preview || busy) return;
    const confirmed = await Taro.showModal({
      cancelText: '返回检查',
      confirmColor: '#9b342d',
      confirmText: '确认设置',
      content: `${preview.unavailableDate} ${minuteLabel(preview.startMinute)}–${minuteLabel(preview.endMinute)}\n将取消 ${preview.affectedAppointmentCount} 条重叠预约并释放档期。\n撤销后不会自动恢复这些预约。`,
      title: '确认影响',
    });
    if (!confirmed.confirm) return;
    setBusy(true);
    setError(null);
    try {
      const created = await createUnavailablePeriod(token, {
        confirmedAffectedAppointmentCount: preview.affectedAppointmentCount,
        endMinute: preview.endMinute,
        reason: reason.trim(),
        startMinute: preview.startMinute,
        unavailableDate: preview.unavailableDate,
      });
      setPeriods((current) =>
        [...current, created].sort((left, right) =>
          `${left.unavailableDate}-${left.startMinute}`.localeCompare(
            `${right.unavailableDate}-${right.startMinute}`,
          ),
        ),
      );
      setPreview(null);
      setReason('');
      await Taro.showToast({ icon: 'success', title: '已设置' });
    } catch (cause) {
      setPreview(null);
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  async function cancel(item: ArtistUnavailablePeriodSummary): Promise<void> {
    if (!token || busy) return;
    const confirmed = await Taro.showModal({
      cancelText: '保留',
      confirmText: '确认撤销',
      content: `${item.unavailableDate} ${minuteLabel(item.startMinute)}–${minuteLabel(item.endMinute)}\n撤销后可重新接受预约，但不会恢复此前已取消的预约。`,
      title: '撤销不可排班时段',
    });
    if (!confirmed.confirm) return;
    setBusy(true);
    setError(null);
    try {
      await cancelUnavailablePeriod(token, item.id, item.rowVersion);
      setPeriods((current) => current.filter((period) => period.id !== item.id));
      await Taro.showToast({ icon: 'success', title: '已撤销' });
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <PageState kind="LOADING" message="正在读取不可排班时段。" />;
  if (error && !token) {
    return (
      <PageState actionLabel="重新加载" kind="ERROR" message={error} onAction={() => void load()} />
    );
  }

  return (
    <View className="unavailability-page">
      <View className="unavailability-section">
        <Text className="unavailability-title">添加临时不可排班时段</Text>
        <Text className="unavailability-note">
          适用于上课、开会等局部时间；整天不工作请使用请假。
        </Text>
        <View className="unavailability-field">
          <Text>日期</Text>
          <Picker
            end={futureDateValue(7)}
            mode="date"
            onChange={(event) => {
              setDate(event.detail.value);
              resetPreview();
            }}
            start={futureDateValue(1)}
            value={date}
          >
            <View className="unavailability-value">{date}</View>
          </Picker>
        </View>
        <TimePicker
          label="开始时间"
          minute={startMinute}
          onChange={(value) => {
            setStartMinute(value);
            resetPreview();
          }}
          options={START_OPTIONS}
        />
        <TimePicker
          label="结束时间"
          minute={endMinute}
          onChange={(value) => {
            setEndMinute(value);
            resetPreview();
          }}
          options={END_OPTIONS}
        />
        <Textarea
          className="unavailability-reason"
          maxlength={500}
          onInput={(event) => {
            setReason(event.detail.value);
            resetPreview();
          }}
          placeholder="请填写原因，例如：14:00–15:00 上课"
          value={reason}
        />
        {preview ? (
          <View className="unavailability-impact">
            <Text className="impact-title">影响确认</Text>
            <Text>将取消 {preview.affectedAppointmentCount} 条重叠预约</Text>
            <Text>固定关系不会结束，撤销时段也不会恢复预约</Text>
          </View>
        ) : null}
        {error ? <View className="unavailability-error">{error}</View> : null}
        <Button
          className="unavailability-primary"
          disabled={busy}
          onClick={() => void (preview ? submit() : previewImpact())}
        >
          {busy ? '正在处理…' : preview ? '确认设置' : '预览影响'}
        </Button>
      </View>

      <View className="unavailability-section">
        <Text className="unavailability-title">当前有效时段</Text>
        {periods.length === 0 ? (
          <Text className="unavailability-empty">当前没有临时不可排班时段。</Text>
        ) : (
          periods.map((item) => (
            <View className="unavailability-card" key={item.id}>
              <Text className="unavailability-range">
                {item.unavailableDate} {minuteLabel(item.startMinute)}–{minuteLabel(item.endMinute)}
              </Text>
              <Text className="unavailability-card-note">
                {item.reason} · 已取消 {item.affectedAppointmentCount} 条预约
              </Text>
              <Button
                className="unavailability-secondary"
                disabled={busy}
                onClick={() => void cancel(item)}
              >
                撤销时段
              </Button>
            </View>
          ))
        )}
      </View>
    </View>
  );
}

function TimePicker(props: {
  readonly label: string;
  readonly minute: number;
  readonly onChange: (minute: number) => void;
  readonly options: readonly number[];
}) {
  const index = Math.max(0, props.options.indexOf(props.minute));
  return (
    <View className="unavailability-field">
      <Text>{props.label}</Text>
      <Picker
        mode="selector"
        onChange={(event) => {
          const selected = props.options[Number(event.detail.value)];
          if (selected !== undefined) props.onChange(selected);
        }}
        range={props.options.map(minuteLabel)}
        value={index}
      >
        <View className="unavailability-value">{minuteLabel(props.minute)}</View>
      </Picker>
    </View>
  );
}
