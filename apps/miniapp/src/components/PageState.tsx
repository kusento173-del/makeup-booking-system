import { Button, Text, View } from '@tarojs/components';

export type PageStateKind = 'EMPTY' | 'ERROR' | 'LOADING' | 'UNAUTHORIZED';

const DEFAULTS: Readonly<Record<PageStateKind, { message: string; title: string }>> = {
  EMPTY: { message: '当前没有可显示的内容。', title: '暂无数据' },
  ERROR: { message: '请稍后重试。', title: '加载失败' },
  LOADING: { message: '正在读取最新数据。', title: '加载中' },
  UNAUTHORIZED: { message: '当前身份不能访问此入口。', title: '无权访问' },
};

export function PageState(props: {
  readonly actionLabel?: string | undefined;
  readonly kind: PageStateKind;
  readonly message?: string | undefined;
  readonly onAction?: (() => void) | undefined;
  readonly title?: string | undefined;
}) {
  const fallback = DEFAULTS[props.kind];
  return (
    <View className={`page-state ${props.kind.toLowerCase()}`} role="status">
      <Text className="page-state-title">{props.title ?? fallback.title}</Text>
      <Text className="page-state-message">{props.message ?? fallback.message}</Text>
      {props.actionLabel && props.onAction ? (
        <Button className="page-state-action" onClick={props.onAction}>
          {props.actionLabel}
        </Button>
      ) : null}
    </View>
  );
}
