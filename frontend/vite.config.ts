import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  // MapLibre loads a web worker; Vite's pre-bundling breaks its URL in dev.
  optimizeDeps: {
    exclude: ['maplibre-gl'],
  },
  server: {
    // Requests to /api go to the backend, so no CORS setup is needed in development.
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
})