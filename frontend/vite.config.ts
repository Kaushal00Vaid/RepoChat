import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        ws: true,
        configure: (proxy) => {
          // Suppress ECONNRESET noise when uvicorn reloads
          proxy.on('error', (err, _req, res) => {
            if ((err as NodeJS.ErrnoException).code === 'ECONNRESET') return
            console.error('[proxy error]', err.message)
            // res can be Socket (WebSocket) or ServerResponse (HTTP); only
            // ServerResponse has headersSent / writeHead.
            if (res instanceof (require('http') as typeof import('http')).ServerResponse) {
              if (!res.headersSent) {
                res.writeHead(502)
                res.end('Backend unavailable')
              }
            }
          })
        },
      },
    },
  },
})

