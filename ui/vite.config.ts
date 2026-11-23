import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// The app is served by SFTPGo at <base>/web/console. Built assets go to
// ../static/console and are referenced relative to a <base href> tag that
// the Go handler injects, so the same build works under any base URL.
export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: {
    outDir: '../static/console',
    emptyOutDir: true,
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
  server: {
    port: 5173,
    proxy: {
      '/api/v2': { target: 'http://127.0.0.1:8080', changeOrigin: false },
      '/static/': { target: 'http://127.0.0.1:8080', changeOrigin: false },
    },
  },
});
