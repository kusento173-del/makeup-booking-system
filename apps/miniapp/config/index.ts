import { defineConfig } from '@tarojs/cli';

const apiBaseUrl = process.env.TARO_APP_API_BASE_URL ?? 'http://127.0.0.1:3000';

export default defineConfig({
  projectName: 'makeup-booking-miniapp',
  date: '2026-07-21',
  defineConstants: {
    __API_BASE_URL__: JSON.stringify(apiBaseUrl),
  },
  designWidth: 750,
  deviceRatio: {
    375: 2,
    640: 1.17,
    750: 1,
    828: 0.905,
  },
  sourceRoot: 'src',
  outputRoot: 'dist',
  plugins: ['@tarojs/plugin-platform-weapp'],
  framework: 'react',
  compiler: 'webpack5',
  cache: {
    enable: true,
  },
  mini: {
    postcss: {
      pxtransform: {
        enable: true,
        config: {},
      },
      url: {
        enable: true,
        config: {
          limit: 1024,
        },
      },
      cssModules: {
        enable: false,
        config: {
          namingPattern: 'module',
          generateScopedName: '[name]__[local]___[hash:base64:5]',
        },
      },
    },
  },
});
