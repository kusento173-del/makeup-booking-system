import { Button, Text, View } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { useMemo, useState } from 'react';

import { ApiError } from '../../api-client';
import {
  cancelAppointment,
  type AppointmentListItem,
  listAppointments,
} from '../../appointment-api';
import {
  appointmentTime,
  canCancelAppointment,
  rescheduleRoute,
  STATUS_LABELS,
} from '../../appointment-view';
import { restoreSession } from '../../auth-session';
import { PageState } from '../../components/PageState';
import { getManagedHostWorkspace, type ManagedHostSummary } from '../../fixed-api';
import {
  managedHostActionRoute,
  managedHostBookingLabel,
  managedHostDetailDates,
  managedHostFixedLabel,
  managedHostPendingLabel,
} from '../../managed-host-view';
import './index.css';

export default function ManagedHostDetailPage() {
  const routeParams = Taro.getCurrentInstance().router?.params ?? {};
  const dates = useMemo(() => managedHostDetailDates(), []);
  const hostId = typeof routeParams.hostId === 'string' ? routeParams.hostId : '';
  const relationDate =
    typeof routeParams.date === 'string' ? routeParams.date : (dates[1]?.date ?? '');
  const [token, setToken] = useState('');
  const [host, setHost] = useState<ManagedHostSummary | null>(null);
  const [items, setItems] = useState<readonly AppointmentListItem[]>([]);
  const [busy, setBusy] = useState(true);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
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
      if (session.role.roleCode !== 'OPERATOR' || !hostId || !relationDate) {
        setError('当前入口无权查看该主播。');
        return;
      }
      const [managedHost, appointments] = await Promise.all([
        getManagedHostWorkspace(session.accessToken, relationDate, hostId),
        listAppointments({
          fromDate: dates[0]?.date ?? relationDate,
          hostId,
          page: 1,
          pageSize: 100,
          toDate: dates[dates.length - 1]?.date ?? relationDate,
          token: session.accessToken,
        }),
      ]);
      if (!managedHost) {
        setError('该主播不在目标日期的负责范围内。');
        return;
      }
      setToken(session.accessToken);
      setHost(managedHost);
      setItems(appointments.items);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : '无法读取主播排班，请稍后重试。');
    } finally {
      setBusy(false);
    }
  }

  async function cancel(item: AppointmentListItem): Promise<void> {
    if (!token || cancellingId || !canCancelAppointment(item, 'OPERATOR')) return;
    const confirmation = await Taro.showModal({
      cancelText: '保留预约',
      confirmColor: '#9b342d',
      confirmText: '确认取消',
      content: [
        `${item.hostName}（${item.hostCode}）`,
        `${item.date} ${appointmentTime(item)}`,
        `${item.artistNickname} · ${item.siteName}`,
        '取消后该时间会立即释放，原记录保留为已取消。',
      ].join('\n'),
      title: '确认取消预约',
    });
    if (!confirmation.confirm) return;

    setCancellingId(item.id);
    setError(null);
    try {
      const result = await cancelAppointment(token, item.id, item.rowVersion);
      setItems((current) =>
        current.map((currentItem) =>
          currentItem.id === item.id
            ? { ...currentItem, rowVersion: result.rowVersion, status: result.status }
            : currentItem,
        ),
      );
      await Taro.showToast({ icon: 'success', title: '预约已取消' });
    } catch (cause) {
      setError(
        cause instanceof ApiError ? cause.message : '取消失败，预约状态可能已变化，请刷新后重试。',
      );
    } finally {
      setCancellingId(null);
    }
  }

  function navigate(action: 'booking' | 'fixed', date: string): void {
    void Taro.navigateTo({ url: managedHostActionRoute(action, hostId, date) });
  }

  if (busy && !host) {
    return (
      <View className="host-detail-page">
        <PageState kind="LOADING" message="正在读取主播排班…" />
      </View>
    );
  }
  if (error && !host) {
    return (
      <View className="host-detail-page">
        <PageState
          actionLabel="返回负责主播"
          kind="UNAUTHORIZED"
          message={error}
          onAction={() => void Taro.navigateBack()}
        />
      </View>
    );
  }
  if (!host) return null;

  return (
    <View className="host-detail-page">
      <View className="host-detail-summary">
        <View className="host-detail-heading">
          <View>
            <Text className="host-detail-name">{host.hostName}</Text>
            <Text className="host-detail-meta">
              {host.hostCode} · {host.siteName}
            </Text>
          </View>
          <Text
            className={
              host.bookingAvailability === 'AVAILABLE'
                ? 'host-detail-status available'
                : 'host-detail-status'
            }
          >
            {managedHostBookingLabel(host.bookingAvailability)}
          </Text>
        </View>
        <Text className="host-detail-fixed">{managedHostFixedLabel(host)}</Text>
        {host.pendingRequest ? (
          <Text className="host-detail-pending">
            {managedHostPendingLabel(host.pendingRequest)}
          </Text>
        ) : null}
        <Button
          className="host-detail-fixed-action"
          onClick={() => navigate('fixed', relationDate)}
          size="mini"
        >
          {host.pendingRequest ? '查看固定申请' : host.activeRule ? '管理固定' : '申请固定'}
        </Button>
      </View>

      {error ? <View className="host-detail-error">{error}</View> : null}

      <View className="host-detail-list">
        {dates.map((date) => {
          const appointments = items.filter((item) => item.date === date.date);
          const future = date.date > (dates[0]?.date ?? '');
          return (
            <View className="host-date-card" key={date.date}>
              <View className="host-date-heading">
                <View>
                  <Text className="host-date-label">{date.label}</Text>
                  <Text className="host-date-value">{date.date}</Text>
                </View>
                {future ? (
                  <Button
                    className="host-date-book"
                    onClick={() => navigate('booking', date.date)}
                    size="mini"
                  >
                    代预约
                  </Button>
                ) : null}
              </View>

              {appointments.length === 0 ? (
                <Text className="host-date-empty">无预约</Text>
              ) : (
                <>
                  {appointments.every((item) => item.status === 'CANCELLED') ? (
                    <Text className="host-date-empty">当前无有效预约（保留已取消记录）</Text>
                  ) : null}
                  {appointments.map((item) => (
                    <View className="host-appointment" key={item.id}>
                      <View className="host-appointment-heading">
                        <Text className="host-appointment-time">{appointmentTime(item)}</Text>
                        <Text className={`host-appointment-status ${item.status.toLowerCase()}`}>
                          {STATUS_LABELS[item.status]}
                        </Text>
                      </View>
                      <Text className="host-appointment-detail">
                        {item.artistNickname} · {item.durationMinutes} 分钟 ·{' '}
                        {item.appointmentType === 'FIXED' ? '固定' : '单次'}
                      </Text>
                      {canCancelAppointment(item, 'OPERATOR') ? (
                        <View className="host-appointment-actions">
                          <Button
                            className="host-reschedule"
                            disabled={cancellingId !== null}
                            onClick={() => void Taro.navigateTo({ url: rescheduleRoute(item) })}
                            size="mini"
                          >
                            改期
                          </Button>
                          <Button
                            className="host-cancel"
                            disabled={cancellingId !== null}
                            onClick={() => void cancel(item)}
                            size="mini"
                          >
                            {cancellingId === item.id ? '正在取消…' : '取消'}
                          </Button>
                        </View>
                      ) : null}
                    </View>
                  ))}
                </>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}
