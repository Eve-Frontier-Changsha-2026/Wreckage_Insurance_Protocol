import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    chunkSizeWarningLimit: 1000,
  },
  server: {
    proxy: {
      '/eve-eyes': {
        target: 'https://eve-eyes.d0v.xyz',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/eve-eyes/, ''),
      },
    },
  },
});
