import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      include: ['buffer'],
      globals: { Buffer: true },
    }),
  ],
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: ['market.meerkscan.com'],
    proxy: {
      '/api': {
        target: 'http://market-app:3000',
        changeOrigin: true,
      },
    },
  },
});
