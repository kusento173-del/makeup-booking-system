import { Button, Picker, Text, Textarea, View } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { useState } from 'react';

import { ApiError } from '../../api-client';
import { restoreSession } from '../../auth-session';
import { PageState } from '../../components/PageState';
import {
  cancelLeave,
  createLeave,
  type LeavePreview,
  type LeaveSummary,
  listOwnLeaves,
  previewLeave,
} from '../../leave-api';
import './index.css';

function futureDateValue(days: number, now = new Date()): string {
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function errorMessage(cause: unknown): string {
  return cause instanceof ApiError ? cause.message : '请假操作失败，请稍后重试。';
}

export default function LeavePage() {
  const [token, setToken] = useState('');
  const [leaves, setLeaves] = useState<readonly LeaveSummary[]>([]);
  const [startDate, setStartDate] = useState(() => futureDateValue(1));
  const [endDate, setEndDate] = useState(() => futureDateValue(1));
  const [reason, setReason] = useState('');
  const [preview, setPreview] = useState<LeavePreview | null>(null);
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
      if (!['HOST', 'ARTIST'].includes(session.role.roleCode)) {
        setError('当前身份不能申请本人请假。');
        return;
      }
      setToken(session.accessToken);
      setLeaves(await listOwnLeaves(session.accessToken));
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }

  function updateRange(field: 'endDate' | 'startDate', value: string): void {
    if (field === 'startDate') {
      setStartDate(value);
      if (value > endDate) setEndDate(value);
    } else {
      setEndDate(value);
    }
    setPreview(null);
    setError(null);
  }

  async function previewImpact(): Promise<void> {
    if (!token || busy) return;
    if (endDate < startDate) {
      setError('结束日期不能早于开始日期。');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setPreview(await previewLeave(token, { endDate, startDate }));
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
      confirmText: '确认请假',
      content: `请假日期：${preview.startDate} 至 ${preview.endDate}\n将取消 ${preview.affectedAppointmentCount} 条预约并释放档期。\n取消请假不会恢复这些预约。`,
      title: '确认请假影响',
    });
    if (!confirmed.confirm) return;
    setBusy(true);
    setError(null);
    try {
      const created = await createLeave(token, {
        confirmedAffectedAppointmentCount: preview.affectedAppointmentCount,
        endDate: preview.endDate,
        ...(reason.trim() ? { reason: reason.trim() } : {}),
        startDate: preview.startDate,
      });
      setLeaves((current) =>
        [...current, created].sort((a, b) => a.startDate.localeCompare(b.startDate)),
      );
      setPreview(null);
      setReason('');
      await Taro.showToast({ icon: 'success', title: '请假已生效' });
    } catch (cause) {
      setPreview(null);
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  async function cancel(item: LeaveSummary): Promise<void> {
    if (!token || busy) return;
    const confirmed = await Taro.showModal({
      cancelText: '保留请假',
      confirmText: '取消请假',
      content: `${item.startDate} 至 ${item.endDate}\n取消后不会自动恢复此前已取消的预约。`,
      title: '确认取消请假',
    });
    if (!confirmed.confirm) return;
    setBusy(true);
    setError(null);
    try {
      await cancelLeave(token, item.id, item.rowVersion);
      setLeaves((current) => current.filter((leave) => leave.id !== item.id));
      await Taro.showToast({ icon: 'success', title: '请假已取消' });
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <PageState kind="LOADING" message="正在读取请假记录。" />;
  if (error && !token) {
    return (
      <PageState actionLabel="重新加载" kind="ERROR" message={error} onAction={() => void load()} />
    );
  }

  return (
    <View className="leave-page">
      <View className="leave-section">
        <Text className="leave-title">申请请假</Text>
        <Text className="leave-note">只能申请明日起未来七日内，单次最长连续七日。</Text>
        <DatePicker
          label="开始日期"
          onChange={(value) => updateRange('startDate', value)}
          value={startDate}
        />
        <DatePicker
          label="结束日期"
          onChange={(value) => updateRange('endDate', value)}
          value={endDate}
        />
        <Textarea
          className="leave-reason"
          maxlength={500}
          onInput={(event) => setReason(event.detail.value)}
          placeholder="请假说明（选填）"
          value={reason}
        />
        {preview ? (
          <View className="leave-impact">
            <Text className="impact-title">影响确认</Text>
            <Text>将取消 {preview.affectedAppointmentCount} 条预约</Text>
            <Text>固定关系不会结束，取消请假也不会恢复预约</Text>
          </View>
        ) : null}
        {error ? <View className="leave-error">{error}</View> : null}
        <Button
          className="leave-primary"
          disabled={busy}
          onClick={() => void (preview ? submit() : previewImpact())}
        >
          {busy ? '正在处理…' : preview ? '确认请假' : '预览影响'}
        </Button>
      </View>

      <View className="leave-section">
        <Text className="leave-title">当前有效请假</Text>
        {leaves.length === 0 ? (
          <Text className="leave-empty">当前没有有效请假。</Text>
        ) : (
          leaves.map((item) => (
            <View className="leave-card" key={item.id}>
              <Text className="leave-range">
                {item.startDate} 至 {item.endDate}
              </Text>
              <Text className="leave-card-note">
                已取消 {item.affectedAppointmentCount} 条预约
                {item.reason ? ` · ${item.reason}` : ''}
              </Text>
              <Button className="leave-secondary" disabled={busy} onClick={() => void cancel(item)}>
                取消请假
              </Button>
            </View>
          ))
        )}
      </View>
    </View>
  );
}

function DatePicker(props: {
  readonly label: string;
  readonly onChange: (value: string) => void;
  readonly value: string;
}) {
  return (
    <View className="leave-field">
      <Text>{props.label}</Text>
      <Picker
        end={futureDateValue(7)}
        mode="date"
        onChange={(event) => props.onChange(event.detail.value)}
        start={futureDateValue(1)}
        value={props.value}
      >
        <View className="leave-date">{props.value}</View>
      </Picker>
    </View>
  );
}
