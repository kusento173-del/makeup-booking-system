import { Button, Text, View } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { useState } from 'react';

import { listAppointments, type AppointmentListItem } from '../../appointment-api';
import {
  appointmentSubject,
  appointmentTime,
  scheduleDateRange,
  type ScheduleRange,
} from '../../appointment-view';
import { ApiError } from '../../api-client';
import { restoreSession, type RoleCode } from '../../auth-session';
import './index.css';

const RANGE_OPTIONS: readonly { readonly label: string; readonly value: ScheduleRange }[] = [
  { label: '今日', value: 'TODAY' },
  { label: '明日', value: 'TOMORROW' },
  { label: '未来七日', value: 'SEVEN_DAYS' },
];
const TYPE_LABELS = { FIXED: '固定', SINGLE: '单次' } as const;
const STATUS_LABELS = { BOOKED: '已预约', CANCELLED: '已取消', COMPLETED: '已完成' } as const;

function errorMessage(cause: unknown): string {
  if (cause instanceof ApiError) return cause.message;
  return '排班加载失败，请稍后重试';
}

export default function AppointmentPage() {
  const [range, setRange] = useState<ScheduleRange>('TODAY');
  const [items, setItems] = useState<readonly AppointmentListItem[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [roleCode, setRoleCode] = useState<RoleCode>('HOST');

  useDidShow(() => {
    void load(range);
  });

  async function load(nextRange: ScheduleRange): Promise<void> {
    const session = await restoreSession();
    if (!session) {
      await Taro.reLaunch({ url: '/pages/index/index' });
      return;
    }
    setRoleCode(session.role.roleCode);
    setBusy(true);
    setError(null);
    try {
      const dates = scheduleDateRange(nextRange);
      const result = await listAppointments({ ...dates, token: session.accessToken });
      setItems(result.items);
    } catch (cause) {
      setError(errorMessage(cause));
      setItems([]);
    } finally {
      setBusy(false);
    }
  }

  function selectRange(nextRange: ScheduleRange): void {
    setRange(nextRange);
    void load(nextRange);
  }

  return (
    <View className="schedule-page">
      <View className="range-tabs">
        {RANGE_OPTIONS.map((option) => (
          <Button
            className={range === option.value ? 'range-tab active' : 'range-tab'}
            key={option.value}
            onClick={() => selectRange(option.value)}
            size="mini"
          >
            {option.label}
          </Button>
        ))}
      </View>

      {busy ? <View className="schedule-state">正在加载排班…</View> : null}
      {error ? (
        <View className="schedule-state error" role="alert">
          <Text>{error}</Text>
          <Button className="retry-button" onClick={() => void load(range)} size="mini">
            重新加载
          </Button>
        </View>
      ) : null}
      {!busy && !error && items.length === 0 ? (
        <View className="schedule-state">这个时间范围内暂无化妆安排</View>
      ) : null}

      {!busy && !error
        ? items.map((item) => (
            <View className="appointment-card" key={item.id}>
              <View className="appointment-date">
                <Text>{item.date}</Text>
                <Text>{appointmentTime(item)}</Text>
              </View>
              <Text className="appointment-subject">{appointmentSubject(item, roleCode)}</Text>
              <View className="appointment-meta">
                <Text>{item.siteName}</Text>
                <Text>{item.durationMinutes} 分钟</Text>
                <Text>{TYPE_LABELS[item.appointmentType]}</Text>
                <Text>{STATUS_LABELS[item.status]}</Text>
              </View>
            </View>
          ))
        : null}
    </View>
  );
}
