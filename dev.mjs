import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

console.log('🚀 Démarrage des serveurs de développement...')

// Start Express proxy server for Claude Vision
const serverProcess = spawn('node', [path.join(__dirname, 'server.mjs')], {
  stdio: 'inherit',
  cwd: __dirname,
  env: { ...process.env }
})

// Give server.mjs 2 seconds to start before launching Vite
await new Promise(resolve => setTimeout(resolve, 2000))

// Start Vite dev server
const viteProcess = spawn('node', [path.join(__dirname, 'node_modules/.bin/vite')], {
  stdio: 'inherit',
  cwd: __dirname,
  env: { ...process.env }
})

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Arrêt des serveurs...')
  serverProcess.kill()
  viteProcess.kill()
  process.exit(0)
})

serverProcess.on('error', (err) => {
  console.error('❌ Erreur serveur Express:', err)
  process.exit(1)
})

viteProcess.on('error', (err) => {
  console.error('❌ Erreur Vite:', err)
  process.exit(1)
})
