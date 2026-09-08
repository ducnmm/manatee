import { defineConfig } from 'vite';

export default defineConfig({
  root: 'web',
  server: {
    port: 5173,
    proxy: { '/api': 'http://127.0.0.1:8787' },
  },
  publicDir: 'public',
  build: { outDir: 'dist', emptyOutDir: true },
});
