import { Button, Text, View } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { useState } from 'react';

import { ApiError } from '../../api-client';
import {
  cancelAppointment,
  listAppointments,
  type AppointmentListItem,
} from '../../appointment-api';
import {
  appointmentSubject,
  appointmentTime,
  canCancelAppointment,
  RANGE_OPTIONS,
  scheduleDateRange,
  STATUS_LABELS,
  type ScheduleRange,
} from '../../appointment-view';
import { restoreSession, type RoleCode } from '../../auth-session';
import { PageState } from '../../components/PageState';
import { getMobileHome } from '../../mobile-navigation';
import './index.css';

const PAGE_SIZE = 50;

function errorMessage(cause: unknown): string {
  return cause instanceof ApiError ? cause.message : '无法读取排班，请稍后重试。';
}

export default function SchedulePage() {
  const [range, setRange] = useState<ScheduleRange>('TODAY');
  const [roleCode, setRoleCode] = useState<RoleCode | null>(null);
  const [token, setToken] = useState('');
  const [items, setItems] = useState<readonly AppointmentListItem[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [historyWindow, setHistoryWindow] = useState(0);
  const [windowItemCount, setWindowItemCount] = useState(0);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  useDidShow(() => {
    void load(range, 1, false, 0);
  });

  async function load(
    nextRange: ScheduleRange,
    nextPage: number,
    append: boolean,
    nextHistoryWindow = 0,
  ): Promise<void> {
    setBusy(true);
    setError(null);
    setActionError(null);
    try {
      const session = await restoreSession();
      if (!session) {
        await Taro.reLaunch({ url: '/pages/index/index' });
        return;
      }
      if (!getMobileHome(session.role.roleCode)) {
        setRoleCode(session.role.roleCode);
        setError('当前身份不能使用小程序排班。');
        return;
      }
      const dates = scheduleDateRange(nextRange, new Date(), nextHistoryWindow);
      const result = await listAppointments({
        ...dates,
        page: nextPage,
        pageSize: PAGE_SIZE,
        token: session.accessToken,
      });
      setRoleCode(session.role.roleCode);
      setToken(session.accessToken);
      setRange(nextRange);
      setPage(result.page);
      setTotal(result.total);
      setHistoryWindow(nextHistoryWindow);
      setWindowItemCount((current) =>
        append && nextHistoryWindow === historyWindow
          ? current + result.items.length
          : result.items.length,
      );
      setItems((current) => (append ? [...current, ...result.items] : result.items));
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  async function cancel(item: AppointmentListItem): Promise<void> {
    if (!roleCode || !token || cancellingId || !canCancelAppointment(item, roleCode)) return;
    const confirmation = await Taro.showModal({
      cancelText: '保留预约',
      confirmColor: '#9b342d',
      confirmText: '确认取消',
      content: [
        `${item.hostName}（${item.hostCode}）`,
        `${item.artistNickname} · ${item.siteName}`,
        `${item.date} ${appointmentTime(item)}`,
        '取消后该时间会立即释放，原记录保留为已取消。',
      ].join('\n'),
      title: '确认取消预约',
    });
    if (!confirmation.confirm) return;

    setCancellingId(item.id);
    setActionError(null);
    try {
      const cancelled = await cancelAppointment(token, item.id, item.rowVersion);
      setItems((current) =>
        current.map((currentItem) =>
          currentItem.id === item.id
            ? { ...currentItem, rowVersion: cancelled.rowVersion, status: cancelled.status }
            : currentItem,
        ),
      );
      await Taro.showToast({ icon: 'success', title: '预约已取消' });
    } catch (cause) {
      const message =
        cause instanceof ApiError &&
        ['BOOKING_CANCELLATION_CUTOFF', 'BOOKING_STATE_CONFLICT'].includes(cause.code)
          ? '预约状态或可取消时间已经变化，请刷新排班后重试。'
          : errorMessage(cause);
      setActionError(message);
    } finally {
      setCancellingId(null);
    }
  }

  return (
    <View className="schedule-page">
      <View className="range-tabs">
        {RANGE_OPTIONS.map((option) => (
          <Button
            className={range === option.id ? 'range-tab active' : 'range-tab'}
            disabled={busy}
            key={option.id}
            onClick={() => void load(option.id, 1, false, 0)}
            size="mini"
          >
            {option.label}
          </Button>
        ))}
      </View>

      {!busy && !error ? (
        <View className="schedule-toolbar">
          <Text>{range === 'HISTORY' ? `已显示 ${items.length} 条` : `共 ${total} 条`}</Text>
          <Button
            className="refresh-button"
            onClick={() => void load(range, 1, false, 0)}
            size="mini"
          >
            刷新
          </Button>
        </View>
      ) : null}
      {actionError ? <View className="schedule-action-error">{actionError}</View> : null}

      {busy && items.length === 0 ? <PageState kind="LOADING" /> : null}
      {error ? (
        <PageState
          actionLabel={roleCode && !getMobileHome(roleCode) ? '返回首页' : '重新加载'}
          kind={roleCode && !getMobileHome(roleCode) ? 'UNAUTHORIZED' : 'ERROR'}
          message={error}
          onAction={
            roleCode && !getMobileHome(roleCode)
              ? () => void Taro.reLaunch({ url: '/pages/index/index' })
              : () => void load(range, 1, false, range === 'HISTORY' ? historyWindow : 0)
          }
        />
      ) : null}
      {!busy && !error && items.length === 0 ? (
        <PageState message="所选日期范围内暂无排班。" kind="EMPTY" />
      ) : null}

      {!error && roleCode
        ? items.map((item) => (
            <View className="appointment-card" key={item.id}>
              <View className="appointment-heading">
                <Text className="appointment-subject">{appointmentSubject(item, roleCode)}</Text>
                <Text className={`status ${item.status.toLowerCase()}`}>
                  {STATUS_LABELS[item.status]}
                </Text>
              </View>
              <View className="appointment-time">{appointmentTime(item)}</View>
              <View className="appointment-meta">
                <Text>{item.date}</Text>
                <Text>
                  {item.durationMinutes} 分钟 · {item.appointmentType === 'FIXED' ? '固定' : '单次'}
                </Text>
              </View>
              <View className="appointment-detail">
                <Text>{item.siteName}</Text>
                <Text>
                  主播：{item.hostName} · {item.hostCode}
                  {'\n'}实际预约化妆师：{item.artistNickname}
                </Text>
              </View>
              {canCancelAppointment(item, roleCode) ? (
                <Button
                  className="cancel-button"
                  disabled={cancellingId !== null}
                  onClick={() => void cancel(item)}
                  size="mini"
                >
                  {cancellingId === item.id ? '正在取消…' : '取消预约'}
                </Button>
              ) : null}
            </View>
          ))
        : null}

      {!busy && !error && (windowItemCount < total || range === 'HISTORY') ? (
        <Button
          className="load-more"
          onClick={() =>
            void (windowItemCount < total
              ? load(range, page + 1, true, historyWindow)
              : load(range, 1, true, historyWindow + 1))
          }
        >
          {windowItemCount < total ? '加载更多' : '加载更早'}
        </Button>
      ) : null}
    </View>
  );
}
