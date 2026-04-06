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
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-fabric': ['fabric'],
          'vendor-firebase': ['firebase/app', 'firebase/auth', 'firebase/firestore', 'firebase/storage'],
          'vendor-pdflib': ['pdf-lib'],
          'vendor-export': ['pptxgenjs'],
          'vendor-jszip': ['jszip'],
          'vendor-xlsx': ['xlsx'],
        },
      },
    },
  },
})
