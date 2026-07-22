import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': { rewrite: (path) => path.replace(/^\/api/, ''), target: 'http://127.0.0.1:3000' },
    },
  },
  preview: {
    proxy: {
      '/api': { rewrite: (path) => path.replace(/^\/api/, ''), target: 'http://127.0.0.1:3000' },
    },
  },
});
