import { Button, Input, Text, View } from '@tarojs/components';
import { useEffect, useRef, useState } from 'react';

import { type HostSummary, listManagedHosts } from '../booking-api';
import './ManagedHostPicker.css';

const PAGE_SIZE = 50;

export function ManagedHostPicker(props: {
  readonly date: string;
  readonly onSelect: (host: HostSummary) => void;
  readonly selectedHostId?: string | undefined;
  readonly token: string;
}) {
  const [searchInput, setSearchInput] = useState('');
  const [activeSearch, setActiveSearch] = useState('');
  const [items, setItems] = useState<readonly HostSummary[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    setSearchInput('');
    setActiveSearch('');
    void load('', 1, false);
  }, [props.date, props.token]);

  async function load(search: string, nextPage: number, append: boolean): Promise<void> {
    const currentRequest = ++requestId.current;
    setBusy(true);
    setError(null);
    if (!append) setItems([]);
    try {
      const result = await listManagedHosts(props.token, {
        date: props.date,
        page: nextPage,
        pageSize: PAGE_SIZE,
        ...(search ? { search } : {}),
      });
      if (currentRequest !== requestId.current) return;
      setActiveSearch(search);
      setPage(result.page);
      setTotal(result.total);
      setItems((current) => (append ? [...current, ...result.items] : result.items));
    } catch {
      if (currentRequest === requestId.current) {
        setError('无法读取负责主播，请稍后重试。');
      }
    } finally {
      if (currentRequest === requestId.current) setBusy(false);
    }
  }

  function search(): void {
    void load(searchInput.trim(), 1, false);
  }

  return (
    <View>
      <View className="host-search">
        <Input
          className="host-search-input"
          maxlength={64}
          onConfirm={search}
          onInput={(event) => setSearchInput(event.detail.value)}
          placeholder="输入主播编号或姓名"
          value={searchInput}
        />
        <Button className="host-search-button" disabled={busy} onClick={search} size="mini">
          查询
        </Button>
      </View>

      {error ? <View className="host-picker-error">{error}</View> : null}
      {busy && items.length === 0 ? (
        <Text className="host-picker-state">正在读取负责主播…</Text>
      ) : null}
      {!busy && !error && items.length === 0 ? (
        <Text className="host-picker-state">
          {activeSearch ? '没有匹配的负责主播。' : '该日期没有有效负责主播。'}
        </Text>
      ) : null}

      <View className="host-list">
        {items.map((host) => {
          const active = host.qualificationStatus === 'ACTIVE';
          return (
            <Button
              className={props.selectedHostId === host.id ? 'host-option active' : 'host-option'}
              disabled={busy || !active}
              key={host.id}
              onClick={() => props.onSelect(host)}
            >
              <View>
                <Text className="host-option-name">{host.nickname ?? host.realName}</Text>
                <Text className="host-option-code">{host.hostCode}</Text>
              </View>
              <Text className={active ? 'host-option-status' : 'host-option-status unavailable'}>
                {active ? '选择' : '不可预约'}
              </Text>
            </Button>
          );
        })}
      </View>

      {!busy && !error && items.length < total ? (
        <Button className="host-load-more" onClick={() => void load(activeSearch, page + 1, true)}>
          加载更多
        </Button>
      ) : null}
    </View>
  );
}
