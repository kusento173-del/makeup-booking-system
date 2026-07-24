import { Text, View } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { useState } from 'react';

import { ApiError } from '../../api-client';
import { restoreSession } from '../../auth-session';
import { PageState } from '../../components/PageState';
import { listMyFixedRelations, type MyFixedRelation } from '../../fixed-api';
import { fixedTimeLabel, weekdayLabel } from '../../fixed-view';
import './index.css';

export default function FixedRelationsPage() {
  const [role, setRole] = useState<'HOST' | 'ARTIST' | null>(null);
  const [items, setItems] = useState<readonly MyFixedRelation[]>([]);
  const [busy, setBusy] = useState(true);
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
      if (session.role.roleCode !== 'HOST' && session.role.roleCode !== 'ARTIST') {
        setError('当前身份不能查看此页面。');
        return;
      }
      setRole(session.role.roleCode);
      setItems(await listMyFixedRelations(session.accessToken));
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : '无法读取固定关系，请稍后重试。');
    } finally {
      setBusy(false);
    }
  }

  const title = role === 'ARTIST' ? '固定主播' : '固定化妆师';
  const empty = role === 'ARTIST' ? '当前没有固定主播。' : '当前没有固定化妆师。';

  if (busy) {
    return (
      <View className="fixed-relations-page">
        <PageState kind="LOADING" message="正在读取固定关系…" />
      </View>
    );
  }
  if (error) {
    return (
      <View className="fixed-relations-page">
        <PageState
          actionLabel="重新加载"
          kind="ERROR"
          message={error}
          onAction={() => void load()}
        />
      </View>
    );
  }

  return (
    <View className="fixed-relations-page">
      <View className="fixed-relations-header">
        <Text className="fixed-relations-title">{title}</Text>
        <Text className="fixed-relations-note">仅显示今天正在生效的固定关系。</Text>
      </View>

      {items.length === 0 ? <Text className="fixed-relations-empty">{empty}</Text> : null}
      <View className="fixed-relations-list">
        {items.map((item) => (
          <View className="fixed-relation-card" key={item.id}>
            <Text className="fixed-relation-name">
              {role === 'ARTIST' ? item.hostName : item.artistNickname}
            </Text>
            <Text className="fixed-relation-meta">
              {role === 'ARTIST' ? `${item.hostCode} · ` : ''}
              {item.siteName}
            </Text>
            <Text className="fixed-relation-time">
              {weekdayLabel(item.weekdays)} ·{' '}
              {fixedTimeLabel(item.startMinute, item.startMinute + item.durationMinutes)}
            </Text>
            <Text className="fixed-relation-validity">
              {item.validFrom} 起 · {item.validUntil ? `${item.validUntil} 前有效` : '长期有效'}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
