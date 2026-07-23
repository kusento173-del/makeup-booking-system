import type { PropsWithChildren } from 'react';
import { useError, useUnhandledRejection } from '@tarojs/taro';

import './app.css';

export default function App({ children }: PropsWithChildren) {
  useError((error) => {
    console.error('[miniapp:error]', error);
  });
  useUnhandledRejection((event) => {
    console.error('[miniapp:unhandled-rejection]', event.reason);
  });

  return children;
}
