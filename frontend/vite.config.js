import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const apiTarget = process.env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:8000'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    proxy: {
      '/auth': apiTarget,
      '/admin': apiTarget,
      '/workspaces': apiTarget,
      '/library': apiTarget,
      '/conversations': apiTarget,
      '/pdf': apiTarget,
      '/rag': apiTarget,
      '/quiz': apiTarget,
      '/notes': apiTarget,
      '/mindmap': apiTarget,
      '/analytics': apiTarget,
      '/settings': apiTarget,
    },
  },
})
