import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
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
            if (!res.headersSent) {
              (res as import('http').ServerResponse).writeHead(502)
              res.end('Backend unavailable')
            }
          })
        },
      },
    },
  },
})
