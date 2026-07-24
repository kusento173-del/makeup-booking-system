import { Button, Picker, Text, Textarea, View } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { useState } from 'react';

import { ApiError } from '../../api-client';
import { restoreSession } from '../../auth-session';
import { PageState } from '../../components/PageState';
import {
  type ArtistShift,
  getCurrentShift,
  getLatestShiftChange,
  getOwnArtist,
  setInitialShift,
  type ShiftChange,
  type ShiftDefinition,
  submitShiftChange,
  withdrawShiftChange,
} from '../../shift-api';
import {
  END_TIME_OPTIONS,
  optionIndex,
  shiftTimeLabel,
  START_TIME_OPTIONS,
  validateShiftDefinition,
  WEEKDAYS,
  workdayLabel,
} from '../../shift-view';
import './index.css';

const DEFAULT_SHIFT: ShiftDefinition = {
  breakEndMinute: 780,
  breakStartMinute: 720,
  workEndMinute: 1080,
  workStartMinute: 540,
  workdays: [1, 2, 3, 4, 5],
};

function errorMessage(cause: unknown): string {
  if (cause instanceof ApiError) return cause.message;
  return '班次操作失败，请稍后重试。';
}

function nextDateValue(now = new Date()): string {
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export default function ShiftPage() {
  const [artistName, setArtistName] = useState('');
  const [artistId, setArtistId] = useState('');
  const [token, setToken] = useState('');
  const [current, setCurrent] = useState<ArtistShift | null>(null);
  const [latestChange, setLatestChange] = useState<ShiftChange | null>(null);
  const [definition, setDefinition] = useState<ShiftDefinition>(DEFAULT_SHIFT);
  const [hasBreak, setHasBreak] = useState(true);
  const [editing, setEditing] = useState(false);
  const [effectiveFrom, setEffectiveFrom] = useState(nextDateValue);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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
        setError('当前身份不能设置化妆师班次。');
        return;
      }
      const artist = await getOwnArtist(session.accessToken);
      if (!artist || artist.employmentStatus !== 'ACTIVE') {
        setError('当前账号没有可用的化妆师档案。');
        return;
      }
      setArtistId(artist.id);
      setArtistName(artist.nickname);
      setToken(session.accessToken);
      const [currentShift, recentChange] = await Promise.all([
        getCurrentShift(session.accessToken, artist.id),
        getLatestShiftChange(session.accessToken),
      ]);
      setCurrent(currentShift);
      setLatestChange(recentChange);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }

  function toggleWorkday(workday: number): void {
    const selected = definition.workdays.includes(workday)
      ? definition.workdays.filter((item) => item !== workday)
      : [...definition.workdays, workday].sort((left, right) => left - right);
    setDefinition({ ...definition, workdays: selected });
  }

  function updateBreak(enabled: boolean): void {
    setHasBreak(enabled);
    setDefinition({
      ...definition,
      breakEndMinute: enabled ? 780 : null,
      breakStartMinute: enabled ? 720 : null,
    });
  }

  function beginEdit(): void {
    if (!current) return;
    setDefinition({
      breakEndMinute: current.breakEndMinute,
      breakStartMinute: current.breakStartMinute,
      workEndMinute: current.workEndMinute,
      workStartMinute: current.workStartMinute,
      workdays: current.workdays,
    });
    setHasBreak(current.breakStartMinute !== null);
    setEffectiveFrom(nextDateValue());
    setReason('');
    setError(null);
    setEditing(true);
  }

  async function submit(): Promise<void> {
    if (!artistId || !token) return;
    const validationError = validateShiftDefinition(definition);
    if (validationError) {
      setError(validationError);
      return;
    }
    if (current && !reason.trim()) {
      setError('请填写修改原因。');
      return;
    }
    const confirmed = await Taro.showModal({
      cancelText: '返回修改',
      confirmText: current ? '提交审核' : '确认保存',
      content: `${workdayLabel(definition.workdays)}\n${shiftTimeLabel(definition)}\n${
        current
          ? `计划 ${effectiveFrom} 生效，提交后由客服审核。`
          : '首次设置无需审批，保存后立即生效。'
      }`,
      title: '确认固定班次',
    });
    if (!confirmed.confirm) return;

    setSaving(true);
    setError(null);
    try {
      if (current) {
        const change = await submitShiftChange(token, artistId, {
          ...definition,
          effectiveFrom,
          reason: reason.trim(),
        });
        setLatestChange(change);
        setEditing(false);
        await Taro.showToast({ icon: 'success', title: '已提交审核' });
      } else {
        const saved = await setInitialShift(token, artistId, definition);
        setCurrent(saved);
        await Taro.showToast({ icon: 'success', title: '班次已设置' });
      }
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  async function withdraw(): Promise<void> {
    if (!latestChange || latestChange.status !== 'PENDING' || !token) return;
    const confirmed = await Taro.showModal({
      cancelText: '保留申请',
      confirmText: '确认撤回',
      content: '撤回后可以重新提交班次修改申请。',
      title: '撤回班次修改',
    });
    if (!confirmed.confirm) return;
    setSaving(true);
    setError(null);
    try {
      await withdrawShiftChange(token, latestChange.id, latestChange.rowVersion);
      setLatestChange({ ...latestChange, status: 'WITHDRAWN' });
      await Taro.showToast({ icon: 'success', title: '申请已撤回' });
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <PageState kind="LOADING" message="正在读取当前班次。" />;
  if (error && !artistId) {
    return (
      <PageState actionLabel="重新加载" kind="ERROR" message={error} onAction={() => void load()} />
    );
  }

  if (current && !editing) {
    return (
      <View className="shift-page">
        <View className="shift-card">
          <Text className="shift-title">{artistName}的当前班次</Text>
          <Text className="shift-row">工作日：{workdayLabel(current.workdays)}</Text>
          <Text className="shift-row">工作时间：{shiftTimeLabel(current)}</Text>
          <Text className="shift-row">生效日期：{current.validFrom}</Text>
          <Text className="shift-note">
            当前为第 {current.versionNo} 版。首次设置已完成，后续修改需要提交客服审核。
          </Text>
        </View>
        {latestChange ? (
          <View className="shift-warning">
            <Text className="warning-title">{changeStatusTitle(latestChange.status)}</Text>
            <Text className="shift-row">计划生效：{latestChange.effectiveFrom}</Text>
            <Text className="shift-row">工作日：{workdayLabel(latestChange.workdays)}</Text>
            <Text className="shift-row">工作时间：{shiftTimeLabel(latestChange)}</Text>
            <Text className="shift-row">修改原因：{latestChange.reason}</Text>
            {latestChange.reviewComment ? (
              <Text className="shift-row">审核意见：{latestChange.reviewComment}</Text>
            ) : null}
            <Text className="shift-note">{changeStatusNote(latestChange.status)}</Text>
            {latestChange.status === 'PENDING' ? (
              <Button
                className="secondary-button"
                disabled={saving}
                onClick={() => void withdraw()}
              >
                {saving ? '正在撤回…' : '撤回申请'}
              </Button>
            ) : (
              <Button className="secondary-button" onClick={beginEdit}>
                再次申请修改
              </Button>
            )}
          </View>
        ) : (
          <Button className="save-button" onClick={beginEdit}>
            申请修改班次
          </Button>
        )}
        {error ? <View className="shift-error">{error}</View> : null}
      </View>
    );
  }

  return (
    <View className="shift-page">
      <View className="shift-warning">
        <Text className="warning-title">{current ? '修改固定班次' : '尚未设置可预约时间'}</Text>
        <Text className="warning-text">
          {current
            ? '修改申请需客服审核，审核通过前仍按当前班次开放预约。'
            : '设置完成前，主播无法预约你。所有工作日共用同一套班次。'}
        </Text>
      </View>

      <View className="shift-card">
        <Text className="shift-title">1. 选择每周工作日</Text>
        <View className="weekday-grid">
          {WEEKDAYS.map((weekday) => (
            <Button
              className={
                definition.workdays.includes(weekday.value)
                  ? 'weekday-button active'
                  : 'weekday-button'
              }
              key={weekday.value}
              onClick={() => toggleWorkday(weekday.value)}
            >
              {weekday.label}
            </Button>
          ))}
        </View>
      </View>

      <View className="shift-card">
        <Text className="shift-title">2. 设置固定时间</Text>
        <TimePicker
          label="上班时间"
          minute={definition.workStartMinute}
          onChange={(workStartMinute) => setDefinition({ ...definition, workStartMinute })}
          options={START_TIME_OPTIONS}
        />
        <View className="break-choice">
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
          label="下班时间"
          minute={definition.workEndMinute}
          onChange={(workEndMinute) => setDefinition({ ...definition, workEndMinute })}
          options={END_TIME_OPTIONS}
        />
      </View>

      <View className="shift-card">
        <Text className="shift-title">3. 核对一周班次</Text>
        <Text className="shift-row">
          {definition.workdays.length > 0 ? workdayLabel(definition.workdays) : '尚未选择工作日'}
        </Text>
        <Text className="shift-row">{shiftTimeLabel(definition)}</Text>
      </View>

      {current ? (
        <View className="shift-card">
          <Text className="shift-title">4. 填写生效日期和原因</Text>
          <View className="time-field">
            <Text className="time-label">计划生效日期</Text>
            <Picker
              mode="date"
              onChange={(event) => setEffectiveFrom(event.detail.value)}
              start={nextDateValue()}
              value={effectiveFrom}
            >
              <View className="time-value">{effectiveFrom}</View>
            </Picker>
          </View>
          <Textarea
            className="reason-input"
            maxlength={500}
            onInput={(event) => setReason(event.detail.value)}
            placeholder="请简要说明为什么修改班次"
            value={reason}
          />
        </View>
      ) : null}

      {error ? <View className="shift-error">{error}</View> : null}
      <Button className="save-button" disabled={saving} onClick={() => void submit()}>
        {saving ? '正在提交…' : current ? '提交客服审核' : '保存首次班次'}
      </Button>
      {current ? (
        <Button className="secondary-button" disabled={saving} onClick={() => setEditing(false)}>
          取消修改
        </Button>
      ) : null}
    </View>
  );
}

function changeStatusTitle(status: ShiftChange['status']): string {
  if (status === 'PENDING') return '班次修改待审核';
  if (status === 'APPROVED') return '班次修改已通过';
  if (status === 'REJECTED') return '班次修改未通过';
  return '班次修改已撤回';
}

function changeStatusNote(status: ShiftChange['status']): string {
  if (status === 'PENDING') return '审核通过前仍按当前班次开放预约。';
  if (status === 'APPROVED') return '新班次将在计划生效日期开始使用。';
  if (status === 'REJECTED') return '当前班次保持不变，可以调整后重新申请。';
  return '当前班次保持不变，可以重新提交申请。';
}

function TimePicker(props: {
  readonly label: string;
  readonly minute: number;
  readonly onChange: (minute: number) => void;
  readonly options: readonly { readonly label: string; readonly value: number }[];
}) {
  const labels = props.options.map((option) => option.label);
  return (
    <View className="time-field">
      <Text className="time-label">{props.label}</Text>
      <Picker
        mode="selector"
        onChange={(event) => {
          const selected = props.options[Number(event.detail.value)];
          if (selected) props.onChange(selected.value);
        }}
        range={labels}
        value={optionIndex(props.options, props.minute)}
      >
        <View className="time-value">{labels[optionIndex(props.options, props.minute)]}</View>
      </Picker>
    </View>
  );
}
