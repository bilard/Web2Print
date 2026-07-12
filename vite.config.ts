import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// Stamp de build : injecté dans l'app (__BUILD_ID__) ET émis en /version.json.
// L'app polle version.json et affiche « Nouvelle version disponible — Recharger »
// dès qu'un déploiement plus récent est en ligne (SPA jamais rechargée sinon).
const buildId = Date.now().toString(36)
const emitVersion = (): Plugin => ({
  name: 'emit-version-json',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ buildId }) })
  },
})

export default defineConfig({
  plugins: [react(), emitVersion()],
  define: {
    __BUILD_ID__: JSON.stringify(buildId),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'site-web', // dossier de sortie du build (ex-« dist »)
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
