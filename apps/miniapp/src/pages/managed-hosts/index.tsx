import { Button, Input, Text, View } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { useMemo, useRef, useState } from 'react';

import { restoreSession } from '../../auth-session';
import { futureBookingDates } from '../../booking-view';
import { PageState } from '../../components/PageState';
import { type ManagedHostSummary, listManagedHostWorkspace } from '../../fixed-api';
import {
  managedHostActionRoute,
  managedHostBookingLabel,
  managedHostFixedLabel,
  managedHostPendingLabel,
} from '../../managed-host-view';
import './index.css';

const PAGE_SIZE = 20;

export default function ManagedHostsPage() {
  const dates = useMemo(() => futureBookingDates(), []);
  const [token, setToken] = useState('');
  const [date, setDate] = useState(dates[0]?.date ?? '');
  const [searchInput, setSearchInput] = useState('');
  const [activeSearch, setActiveSearch] = useState('');
  const [items, setItems] = useState<readonly ManagedHostSummary[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [initializing, setInitializing] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  useDidShow(() => {
    void initialize();
  });

  async function initialize(): Promise<void> {
    setInitializing(true);
    setError(null);
    try {
      const session = await restoreSession();
      if (!session) {
        await Taro.reLaunch({ url: '/pages/index/index' });
        return;
      }
      if (session.role.roleCode !== 'OPERATOR') {
        setError('只有运营可以查看负责主播。');
        return;
      }
      setToken(session.accessToken);
      await load(session.accessToken, date, activeSearch, 1, false);
    } catch {
      setError('无法读取负责主播，请稍后重试。');
    } finally {
      setInitializing(false);
    }
  }

  async function load(
    accessToken: string,
    targetDate: string,
    search: string,
    nextPage: number,
    append: boolean,
  ): Promise<void> {
    const currentRequest = ++requestId.current;
    setBusy(true);
    setError(null);
    try {
      const result = await listManagedHostWorkspace(accessToken, {
        asOf: targetDate,
        page: nextPage,
        pageSize: PAGE_SIZE,
        ...(search ? { search } : {}),
      });
      if (currentRequest !== requestId.current) return;
      setItems((current) => (append ? [...current, ...result.items] : result.items));
      setActiveSearch(search);
      setPage(result.page);
      setTotal(result.total);
    } catch {
      if (currentRequest === requestId.current) {
        setError('无法读取负责主播，请稍后重试。');
      }
    } finally {
      if (currentRequest === requestId.current) setBusy(false);
    }
  }

  function selectDate(nextDate: string): void {
    if (nextDate === date || busy) return;
    setDate(nextDate);
    setItems([]);
    void load(token, nextDate, activeSearch, 1, false);
  }

  function search(): void {
    const query = searchInput.trim();
    setItems([]);
    void load(token, date, query, 1, false);
  }

  function openBusiness(action: 'booking' | 'fixed', hostId: string): void {
    void Taro.navigateTo({ url: managedHostActionRoute(action, hostId, date) });
  }

  if (initializing) {
    return (
      <View className="managed-page">
        <PageState kind="LOADING" message="正在读取负责主播…" />
      </View>
    );
  }
  if (error && !token) {
    return (
      <View className="managed-page">
        <PageState
          actionLabel="重新加载"
          kind="ERROR"
          message={error}
          onAction={() => void initialize()}
        />
      </View>
    );
  }

  return (
    <View className="managed-page">
      <View className="managed-section">
        <Text className="managed-title">负责主播</Text>
        <Text className="managed-note">按目标日期的有效负责关系显示，共 {total} 人。</Text>

        <Text className="managed-field-label">目标日期</Text>
        <View className="managed-date-row">
          {dates.map((item) => (
            <Button
              className={item.date === date ? 'managed-date active' : 'managed-date'}
              disabled={busy}
              key={item.date}
              onClick={() => selectDate(item.date)}
              size="mini"
            >
              <Text>{item.label}</Text>
              <Text>{item.date.slice(5)}</Text>
            </Button>
          ))}
        </View>

        <View className="managed-search">
          <Input
            className="managed-search-input"
            maxlength={64}
            onConfirm={search}
            onInput={(event) => setSearchInput(event.detail.value)}
            placeholder="输入主播编号或姓名"
            value={searchInput}
          />
          <Button className="managed-search-button" disabled={busy} onClick={search} size="mini">
            查询
          </Button>
        </View>
      </View>

      {error ? <View className="managed-error">{error}</View> : null}
      {busy && items.length === 0 ? <Text className="managed-state">正在查询负责主播…</Text> : null}
      {!busy && !error && items.length === 0 ? (
        <Text className="managed-state">
          {activeSearch ? '没有匹配的负责主播。' : '该日期没有有效负责主播。'}
        </Text>
      ) : null}

      <View className="managed-list">
        {items.map((host) => {
          const canBook = host.bookingAvailability === 'AVAILABLE';
          return (
            <View className="managed-card" key={host.hostId}>
              <View className="managed-card-heading">
                <View>
                  <Text className="managed-host-name">{host.hostName}</Text>
                  <Text className="managed-host-code">
                    {host.hostCode} · {host.siteName}
                  </Text>
                </View>
                <Text className={canBook ? 'managed-status available' : 'managed-status'}>
                  {managedHostBookingLabel(host.bookingAvailability)}
                </Text>
              </View>

              <Text className="managed-fixed">{managedHostFixedLabel(host)}</Text>
              {host.pendingRequest ? (
                <Text className="managed-pending">
                  {managedHostPendingLabel(host.pendingRequest)}
                </Text>
              ) : null}

              <View className="managed-actions">
                <Button
                  className="managed-action primary"
                  disabled={!canBook}
                  onClick={() => openBusiness('booking', host.hostId)}
                  size="mini"
                >
                  代预约
                </Button>
                <Button
                  className="managed-action"
                  onClick={() => openBusiness('fixed', host.hostId)}
                  size="mini"
                >
                  {host.pendingRequest ? '查看申请' : host.activeRule ? '管理固定' : '申请固定'}
                </Button>
              </View>
            </View>
          );
        })}
      </View>

      {!busy && !error && items.length < total ? (
        <Button
          className="managed-load-more"
          onClick={() => void load(token, date, activeSearch, page + 1, true)}
        >
          加载更多
        </Button>
      ) : null}
    </View>
  );
}
