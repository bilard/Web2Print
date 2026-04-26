import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api/claude-vision': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/api/image-proxy': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        // rolldown-vite (Vite 8) exige une fonction pour manualChunks,
        // la forme objet n'est plus acceptée.
        manualChunks: (id) => {
          if (id.includes('node_modules/fabric/')) return 'vendor-fabric'
          if (id.includes('node_modules/firebase/') || id.includes('node_modules/@firebase/')) return 'vendor-firebase'
          if (id.includes('node_modules/pdf-lib/')) return 'vendor-pdflib'
          if (id.includes('node_modules/pptxgenjs/')) return 'vendor-export'
          if (id.includes('node_modules/jszip/')) return 'vendor-jszip'
          if (id.includes('node_modules/xlsx/')) return 'vendor-xlsx'
          return undefined
        },
      },
    },
  },
})
