import { Text, View } from '@tarojs/components';

import { appMetadata } from '../../app-metadata';
import './index.css';

export default function IndexPage() {
  return (
    <View className="page">
      <Text className="stage">{appMetadata.stage}</Text>
      <Text className="title">{appMetadata.name}</Text>
      <Text className="description">正式业务功能将在后续迭代中实现。</Text>
    </View>
  );
}
