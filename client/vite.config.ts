import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Vite dev server. The React client runs on :5173 and proxies all /api and
 * the SignalR hub (/hubs/transactions) to the .NET backend on :5248 — so the
 * browser talks same-origin and no CORS is needed in dev.
 * Kept as-is in the production build (static hosting + nginx proxy).
 */
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: process.env.VITE_PROXY_TARGET ?? 'http://localhost:5248',
        changeOrigin: true,
      },
      '/hubs': {
        target: process.env.VITE_PROXY_TARGET ?? 'http://localhost:5248',
        changeOrigin: true,
        ws: true, // WebSocket upgrade for SignalR
      },
    },
  },
})
