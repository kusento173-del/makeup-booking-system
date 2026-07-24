import { Button, Picker, Text, Textarea, View } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { useState } from 'react';

import { ApiError } from '../../api-client';
import { restoreSession } from '../../auth-session';
import { PageState } from '../../components/PageState';
import {
  listOwnOvertimes,
  type OvertimeItem,
  submitOvertime,
  withdrawOvertime,
} from '../../overtime-api';
import { getCurrentShift, getOwnArtist, type ShiftDefinition } from '../../shift-api';
import {
  END_TIME_OPTIONS,
  optionIndex,
  START_TIME_OPTIONS,
  validateShiftDefinition,
} from '../../shift-view';
import './index.css';

const DEFAULT_DEFINITION: Omit<ShiftDefinition, 'workdays'> = {
  breakEndMinute: 780,
  breakStartMinute: 720,
  workEndMinute: 1080,
  workStartMinute: 540,
};

function futureDateValue(days: number, now = new Date()): string {
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function errorMessage(cause: unknown): string {
  return cause instanceof ApiError ? cause.message : '加班操作失败，请稍后重试。';
}

function minuteLabel(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(
    2,
    '0',
  )}`;
}

export default function OvertimePage() {
  const [token, setToken] = useState('');
  const [artistId, setArtistId] = useState('');
  const [items, setItems] = useState<readonly OvertimeItem[]>([]);
  const [definition, setDefinition] =
    useState<Omit<ShiftDefinition, 'workdays'>>(DEFAULT_DEFINITION);
  const [hasBreak, setHasBreak] = useState(true);
  const [overtimeDate, setOvertimeDate] = useState(() => futureDateValue(1));
  const [reason, setReason] = useState('');
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
        setError('只有化妆师可以提交加班申请。');
        return;
      }
      const artist = await getOwnArtist(session.accessToken);
      if (!artist || artist.employmentStatus !== 'ACTIVE') {
        setError('当前账号没有可用的化妆师档案。');
        return;
      }
      const [page, shift] = await Promise.all([
        listOwnOvertimes(session.accessToken),
        getCurrentShift(session.accessToken, artist.id),
      ]);
      setToken(session.accessToken);
      setArtistId(artist.id);
      setItems(page.items);
      if (shift) {
        const nextDefinition = {
          breakEndMinute: shift.breakEndMinute,
          breakStartMinute: shift.breakStartMinute,
          workEndMinute: shift.workEndMinute,
          workStartMinute: shift.workStartMinute,
        };
        setDefinition(nextDefinition);
        setHasBreak(nextDefinition.breakStartMinute !== null);
      }
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }

  function updateBreak(enabled: boolean): void {
    setHasBreak(enabled);
    setDefinition({
      ...definition,
      breakEndMinute: enabled ? 780 : null,
      breakStartMinute: enabled ? 720 : null,
    });
  }

  async function submit(): Promise<void> {
    if (!token || !artistId || busy) return;
    const validationError = validateShiftDefinition({ ...definition, workdays: [1] });
    if (validationError) {
      setError(validationError);
      return;
    }
    if (!reason.trim()) {
      setError('请填写加班原因。');
      return;
    }
    const confirmed = await Taro.showModal({
      cancelText: '返回检查',
      confirmText: '提交审核',
      content: `${overtimeDate}\n${overtimeTimeLabel(definition)}\n只会开放这一天，不会修改固定班次。`,
      title: '确认加班申请',
    });
    if (!confirmed.confirm) return;
    setBusy(true);
    setError(null);
    try {
      const created = await submitOvertime(token, artistId, {
        ...definition,
        overtimeDate,
        reason: reason.trim(),
      });
      setItems((current) => [created, ...current]);
      setReason('');
      await Taro.showToast({ icon: 'success', title: '已提交审核' });
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  async function withdraw(item: OvertimeItem): Promise<void> {
    if (!token || busy) return;
    const confirmed = await Taro.showModal({
      cancelText: '保留申请',
      confirmText: '确认撤回',
      content: `${item.overtimeDate} ${overtimeTimeLabel(item)}`,
      title: '撤回加班申请',
    });
    if (!confirmed.confirm) return;
    setBusy(true);
    setError(null);
    try {
      await withdrawOvertime(token, item.id, item.rowVersion);
      setItems((current) =>
        current.map((currentItem) =>
          currentItem.id === item.id ? { ...currentItem, status: 'WITHDRAWN' } : currentItem,
        ),
      );
      await Taro.showToast({ icon: 'success', title: '申请已撤回' });
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <PageState kind="LOADING" message="正在读取加班申请。" />;
  if (error && !artistId) {
    return (
      <PageState actionLabel="重新加载" kind="ERROR" message={error} onAction={() => void load()} />
    );
  }

  return (
    <View className="overtime-page">
      <View className="overtime-section">
        <Text className="overtime-title">申请非工作日加班</Text>
        <Text className="overtime-note">
          只能选择明日起未来七日内的常规非工作日，提交后由所属场地客服审核。
        </Text>
        <View className="overtime-field">
          <Text>加班日期</Text>
          <Picker
            end={futureDateValue(7)}
            mode="date"
            onChange={(event) => setOvertimeDate(event.detail.value)}
            start={futureDateValue(1)}
            value={overtimeDate}
          >
            <View className="overtime-value">{overtimeDate}</View>
          </Picker>
        </View>
        <TimePicker
          label="开始时间"
          minute={definition.workStartMinute}
          onChange={(workStartMinute) => setDefinition({ ...definition, workStartMinute })}
          options={START_TIME_OPTIONS}
        />
        <View className="overtime-choice">
          <Button
            className={hasBreak ? 'choice-button active' : 'choice-button'}
            onClick={() => updateBreak(true)}
          >
            有午休
          </Button>
          <Button
            className={!hasBreak ? 'choice-button active' : 'choice-button'}
            onClick={() => updateBreak(false)}
          >
            无午休
          </Button>
        </View>
        {hasBreak ? (
          <>
            <TimePicker
              label="午休开始"
              minute={definition.breakStartMinute ?? 720}
              onChange={(breakStartMinute) => setDefinition({ ...definition, breakStartMinute })}
              options={START_TIME_OPTIONS}
            />
            <TimePicker
              label="午休结束"
              minute={definition.breakEndMinute ?? 780}
              onChange={(breakEndMinute) => setDefinition({ ...definition, breakEndMinute })}
              options={START_TIME_OPTIONS}
            />
          </>
        ) : null}
        <TimePicker
          label="结束时间"
          minute={definition.workEndMinute}
          onChange={(workEndMinute) => setDefinition({ ...definition, workEndMinute })}
          options={END_TIME_OPTIONS}
        />
        <Textarea
          className="overtime-reason"
          maxlength={500}
          onInput={(event) => setReason(event.detail.value)}
          placeholder="请填写加班原因"
          value={reason}
        />
        {error ? <View className="overtime-error">{error}</View> : null}
        <Button className="overtime-primary" disabled={busy} onClick={() => void submit()}>
          {busy ? '正在处理…' : '提交客服审核'}
        </Button>
      </View>

      <View className="overtime-section">
        <Text className="overtime-title">我的加班申请</Text>
        {items.length === 0 ? (
          <Text className="overtime-empty">当前没有加班申请。</Text>
        ) : (
          items.map((item) => (
            <View className="overtime-card" key={item.id}>
              <View className="overtime-card-heading">
                <Text className="overtime-date">{item.overtimeDate}</Text>
                <Text className={`overtime-status ${item.status.toLowerCase()}`}>
                  {statusLabel(item.status)}
                </Text>
              </View>
              <Text className="overtime-card-note">{overtimeTimeLabel(item)}</Text>
              <Text className="overtime-card-note">原因：{item.reason}</Text>
              {item.reviewComment ? (
                <Text className="overtime-card-note">审核意见：{item.reviewComment}</Text>
              ) : null}
              {item.status === 'PENDING' ? (
                <Button
                  className="overtime-secondary"
                  disabled={busy}
                  onClick={() => void withdraw(item)}
                >
                  撤回申请
                </Button>
              ) : null}
            </View>
          ))
        )}
      </View>
    </View>
  );
}

function statusLabel(status: OvertimeItem['status']): string {
  if (status === 'PENDING') return '待审核';
  if (status === 'APPROVED') return '已通过';
  if (status === 'REJECTED') return '未通过';
  return '已撤回';
}

function overtimeTimeLabel(definition: Omit<ShiftDefinition, 'workdays'>): string {
  const work = `${minuteLabel(definition.workStartMinute)}–${minuteLabel(
    definition.workEndMinute,
  )}`;
  if (definition.breakStartMinute === null || definition.breakEndMinute === null) return work;
  return `${work}，午休 ${minuteLabel(definition.breakStartMinute)}–${minuteLabel(
    definition.breakEndMinute,
  )}`;
}

function TimePicker(props: {
  readonly label: string;
  readonly minute: number;
  readonly onChange: (minute: number) => void;
  readonly options: readonly { readonly label: string; readonly value: number }[];
}) {
  const labels = props.options.map((option) => option.label);
  return (
    <View className="overtime-field">
      <Text>{props.label}</Text>
      <Picker
        mode="selector"
        onChange={(event) => {
          const selected = props.options[Number(event.detail.value)];
          if (selected) props.onChange(selected.value);
        }}
        range={labels}
        value={optionIndex(props.options, props.minute)}
      >
        <View className="overtime-value">{labels[optionIndex(props.options, props.minute)]}</View>
      </Picker>
    </View>
  );
}
