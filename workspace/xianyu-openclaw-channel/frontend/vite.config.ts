import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const backendTarget = 'http://localhost:18444';

export default defineConfig({
  base: '/static/',
  server: {
    port: 3000,
    host: '0.0.0.0',
    proxy: {
      // 代理API请求到后端
      '/api': {
        target: backendTarget,
        changeOrigin: true,
      },
      // 代理其他后端请求
      '/cookies': {
        target: backendTarget,
        changeOrigin: true,
      },
      '/qr-login': {
        target: backendTarget,
        changeOrigin: true,
      },
      '/password-login': {
        target: backendTarget,
        changeOrigin: true,
      },
      '/keywords': {
        target: backendTarget,
        changeOrigin: true,
      },
      '/keywords-with-item-id': {
        target: backendTarget,
        changeOrigin: true,
      },
      '/default-reply': {
        target: backendTarget,
        changeOrigin: true,
      },
      '/items': {
        target: backendTarget,
        changeOrigin: true,
      },
      '/cards': {
        target: backendTarget,
        changeOrigin: true,
      },
      '/delivery-rules': {
        target: backendTarget,
        changeOrigin: true,
      },
      '/notification-channels': {
        target: backendTarget,
        changeOrigin: true,
      },
      '/message-notifications': {
        target: backendTarget,
        changeOrigin: true,
      },
      '/ai-reply-settings': {
        target: backendTarget,
        changeOrigin: true,
      },
      '/system-settings': {
        target: backendTarget,
        changeOrigin: true,
      },
      '/user-settings': {
        target: backendTarget,
        changeOrigin: true,
      },
      '/admin': {
        target: backendTarget,
        changeOrigin: true,
      },
      '/analytics': {
        target: backendTarget,
        changeOrigin: true,
      },
      '/backup': {
        target: backendTarget,
        changeOrigin: true,
      },
      '/logs': {
        target: backendTarget,
        changeOrigin: true,
      },
      '/login': {
        target: backendTarget,
        changeOrigin: true,
      },
      '/verify': {
        target: backendTarget,
        changeOrigin: true,
      },
      '/logout': {
        target: backendTarget,
        changeOrigin: true,
      },
      '/register': {
        target: backendTarget,
        changeOrigin: true,
      },
      '/generate-captcha': {
        target: backendTarget,
        changeOrigin: true,
      },
      '/verify-captcha': {
        target: backendTarget,
        changeOrigin: true,
      },
      '/geetest': {
        target: backendTarget,
        changeOrigin: true,
      },
      '/send-verification-code': {
        target: backendTarget,
        changeOrigin: true,
      },
      '/change-password': {
        target: backendTarget,
        changeOrigin: true,
      },
      '/health': {
        target: backendTarget,
        changeOrigin: true,
      },
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  build: {
    outDir: '../static',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: undefined,
      },
    },
    emptyOutDir: false,
  },
});
