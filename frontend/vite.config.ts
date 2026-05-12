import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

console.log("VITE STARTUP ENVIRONMENT DETECTED:")
console.log("process.env.VITE_API_URL =", process.env.VITE_API_URL)
console.log("process.env.VITE_WS_URL =", process.env.VITE_WS_URL)

const apiTarget = process.env.VITE_API_URL || 'http://localhost:3001'
const wsTarget = process.env.VITE_WS_URL || 'ws://localhost:3001'

console.log("VITE CONFIG PROXY TARGETS:")
console.log("  API ->", apiTarget)
console.log("  WS  ->", wsTarget)

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
      },
      '/ws': {
        target: wsTarget,
        ws: true,
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router') || id.includes('scheduler')) {
              return 'vendor-react';
            }
            if (id.includes('lucide') || id.includes('recharts') || id.includes('d3')) {
              return 'vendor-ui';
            }
          }
        },
      },
    },
  },
})
