import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './app/App'

// Auto-récupération du « chunk périmé » : si un module chargé en lazy (EditorPage, etc.)
// ne peut plus être récupéré — typiquement parce qu'un déploiement a remplacé les fichiers
// hashés pendant que l'onglet était ouvert — on recharge la page pour obtenir la nouvelle
// version. Garde anti-boucle : un seul reload par fenêtre de 10 s.
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault()
  const KEY = 'vite:preloadError:lastReload'
  const last = Number(sessionStorage.getItem(KEY) || '0')
  if (Date.now() - last > 10_000) {
    sessionStorage.setItem(KEY, String(Date.now()))
    window.location.reload()
  }
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
