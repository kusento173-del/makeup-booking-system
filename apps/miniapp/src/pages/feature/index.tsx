import { Text, View } from '@tarojs/components';
import Taro, { useDidShow, useRouter } from '@tarojs/taro';
import { useState } from 'react';

import { restoreSession } from '../../auth-session';
import { PageState, type PageStateKind } from '../../components/PageState';
import { getAllowedFeature, type MobileFeature } from '../../mobile-navigation';
import './index.css';

interface FeaturePageState {
  readonly feature: MobileFeature | null;
  readonly kind: PageStateKind;
  readonly message?: string;
}

export default function FeaturePage() {
  const router = useRouter();
  const [state, setState] = useState<FeaturePageState>({
    feature: null,
    kind: 'LOADING',
  });

  useDidShow(() => {
    void load();
  });

  async function load(): Promise<void> {
    setState({ feature: null, kind: 'LOADING' });
    try {
      const session = await restoreSession();
      if (!session) {
        await Taro.reLaunch({ url: '/pages/index/index' });
        return;
      }
      const feature = getAllowedFeature(session.role.roleCode, router.params.feature);
      if (!feature) {
        setState({ feature: null, kind: 'UNAUTHORIZED' });
        return;
      }
      await Taro.setNavigationBarTitle({ title: feature.title });
      setState({ feature, kind: 'EMPTY' });
    } catch {
      setState({
        feature: null,
        kind: 'ERROR',
        message: '无法读取当前身份，请返回首页后重试。',
      });
    }
  }

  return (
    <View className="feature-page">
      {state.feature ? (
        <View className="feature-header">
          <Text className="feature-title">{state.feature.title}</Text>
          <Text className="feature-description">{state.feature.description}</Text>
        </View>
      ) : null}
      <PageState
        actionLabel={state.kind === 'UNAUTHORIZED' ? '返回首页' : undefined}
        kind={state.kind}
        message={
          state.kind === 'EMPTY' ? '入口已经建立，业务数据将在对应功能闭环中接入。' : state.message
        }
        onAction={
          state.kind === 'UNAUTHORIZED'
            ? () => void Taro.reLaunch({ url: '/pages/index/index' })
            : undefined
        }
        title={state.kind === 'EMPTY' ? '功能准备中' : undefined}
      />
    </View>
  );
}
