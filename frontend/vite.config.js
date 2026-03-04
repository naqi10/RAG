import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 3000,
    proxy: {
      '/auth': 'http://127.0.0.1:8000',
      '/admin': 'http://127.0.0.1:8000',
      '/workspaces': 'http://127.0.0.1:8000',
      '/conversations': 'http://127.0.0.1:8000',
      '/pdf': 'http://127.0.0.1:8000',
      '/rag': 'http://127.0.0.1:8000',
      '/quiz': 'http://127.0.0.1:8000',
      '/notes': 'http://127.0.0.1:8000',
      '/mindmap': 'http://127.0.0.1:8000',
      '/analytics': 'http://127.0.0.1:8000',
      '/settings': 'http://127.0.0.1:8000',
    },
  },
})
