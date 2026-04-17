import { defineConfig } from 'vite'
import path from 'path'
import { copyFileSync, mkdirSync, existsSync } from 'fs'

export default defineConfig({
  resolve: {
    alias: {
      '@overlay': path.resolve(__dirname, '../src/features/scraping-templates/overlayScript.ts'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        background: path.resolve(__dirname, 'src/background.ts'),
        content: path.resolve(__dirname, 'src/content.ts'),
        popup: path.resolve(__dirname, 'src/popup.html'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name][extname]',
      },
    },
    target: 'es2022',
    minify: false,
  },
  plugins: [
    {
      name: 'copy-manifest-and-icons',
      writeBundle() {
        copyFileSync('manifest.json', 'dist/manifest.json')
        if (existsSync('icons')) {
          mkdirSync('dist/icons', { recursive: true })
          for (const size of ['16', '48', '128']) {
            const src = `icons/${size}.png`
            if (existsSync(src)) copyFileSync(src, `dist/icons/${size}.png`)
          }
        }
        // Vite with HTML input nests output under dist/src/. Move popup.html
        // to the root dist/ so the manifest entry `"default_popup":"popup.html"` resolves.
        if (existsSync('dist/src/popup.html')) {
          copyFileSync('dist/src/popup.html', 'dist/popup.html')
        }
      },
    },
  ],
})
