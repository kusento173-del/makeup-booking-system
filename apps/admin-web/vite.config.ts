import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const apiProxyTarget = process.env.ADMIN_API_PROXY_TARGET ?? 'http://127.0.0.1:3000';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': { rewrite: (path) => path.replace(/^\/api/, ''), target: apiProxyTarget },
    },
  },
  preview: {
    proxy: {
      '/api': { rewrite: (path) => path.replace(/^\/api/, ''), target: apiProxyTarget },
    },
  },
});
