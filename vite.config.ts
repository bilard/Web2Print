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
          if (id.includes('node_modules/jszip/')) return 'vendor-jszip'
          if (id.includes('node_modules/xlsx/')) return 'vendor-xlsx'
          // Runtime framework : react + react-dom + scheduler + router doivent rester
          // groupés (même chunk) pour éviter les problèmes d'ordre de chargement.
          if (
            id.includes('node_modules/react/') ||
            id.includes('node_modules/react-dom/') ||
            id.includes('node_modules/scheduler/') ||
            id.includes('node_modules/react-router') ||
            id.includes('node_modules/@remix-run/')
          )
            return 'vendor-react'
          if (id.includes('node_modules/@radix-ui/')) return 'vendor-radix'
          if (id.includes('node_modules/@tanstack/')) return 'vendor-query'
          if (id.includes('node_modules/lucide-react/')) return 'vendor-icons'
          if (id.includes('node_modules/three/')) return 'vendor-three'
          if (id.includes('node_modules/opentype.js/')) return 'vendor-opentype'
          if (id.includes('node_modules/turndown/')) return 'vendor-turndown'
          // NE PAS manual-chunker @xyflow (reactflow) ni pptxgenjs : rolldown-vite
          // lie en STATIQUE (modulepreload eager) un chunk vendor nommé pourtant
          // référencé uniquement en dynamique → ils étaient chargés au boot. Sans
          // règle, ils se replient correctement dans leurs chunks lazy (WorkflowEditorPage,
          // export/merge). Vérifié : absents du modulepreload de index.html.
          return undefined
        },
      },
    },
  },
})
