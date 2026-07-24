import { Button, Picker, Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useEffect, useState } from 'react';

import { ApiError } from '../../api-client';
import { restoreSession } from '../../auth-session';
import { PageState } from '../../components/PageState';
import {
  type ArtistShift,
  getCurrentShift,
  getOwnArtist,
  setInitialShift,
  type ShiftDefinition,
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

export default function ShiftPage() {
  const [artistName, setArtistName] = useState('');
  const [artistId, setArtistId] = useState('');
  const [token, setToken] = useState('');
  const [current, setCurrent] = useState<ArtistShift | null>(null);
  const [definition, setDefinition] = useState<ShiftDefinition>(DEFAULT_SHIFT);
  const [hasBreak, setHasBreak] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, []);

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
      setCurrent(await getCurrentShift(session.accessToken, artist.id));
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

  async function submit(): Promise<void> {
    if (!artistId || !token) return;
    const validationError = validateShiftDefinition(definition);
    if (validationError) {
      setError(validationError);
      return;
    }
    const confirmed = await Taro.showModal({
      cancelText: '返回修改',
      confirmText: '确认保存',
      content: `${workdayLabel(definition.workdays)}\n${shiftTimeLabel(
        definition,
      )}\n首次设置无需审批，保存后立即生效。`,
      title: '确认固定班次',
    });
    if (!confirmed.confirm) return;

    setSaving(true);
    setError(null);
    try {
      const saved = await setInitialShift(token, artistId, definition);
      setCurrent(saved);
      await Taro.showToast({ icon: 'success', title: '班次已设置' });
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

  if (current) {
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
      </View>
    );
  }

  return (
    <View className="shift-page">
      <View className="shift-warning">
        <Text className="warning-title">尚未设置可预约时间</Text>
        <Text className="warning-text">设置完成前，主播无法预约你。所有工作日共用同一套班次。</Text>
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

      {error ? <View className="shift-error">{error}</View> : null}
      <Button className="save-button" disabled={saving} onClick={() => void submit()}>
        {saving ? '正在保存…' : '保存首次班次'}
      </Button>
    </View>
  );
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
