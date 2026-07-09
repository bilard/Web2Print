import { useEffect } from 'react'
import { PulseGate } from '@/components/pulse/PulseGate'
import { PulseApp } from '@/components/pulse/PulseApp'
import '@/components/pulse/pulse.css'

/** Route `/pulse` : la PWA mobile de suivi du trafic ibs-studio.com. */
export default function PulsePage() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    // En dev, le SW (cache-first) interfère avec le HMR de Vite → on ne l'enregistre
    // qu'en production. Scope /pulse : il ne contrôle que cette PWA, jamais le reste du site.
    if (!import.meta.env.PROD) return
    const sw = navigator.serviceWorker

    // Auto-mise à jour de la PWA installée. iOS gèle le contexte web en arrière-plan :
    // au réveil (visibilitychange → visible) on force un contrôle du SW ; s'il en trouve
    // un nouveau (SHA du build changé, cf. cache-buster de promo-as-root.mjs), il
    // s'active (skipWaiting) et prend le contrôle (clients.claim) → controllerchange →
    // on recharge une fois pour servir le dernier bundle. Sans ça, l'app reste figée.
    let reloading = false
    const reloadOnNewSW = () => { if (reloading) return; reloading = true; window.location.reload() }
    const checkForUpdate = () => { void sw.getRegistration('/pulse').then((r) => r?.update()).catch(() => {}) }
    const onVisible = () => { if (document.visibilityState === 'visible') checkForUpdate() }

    sw.addEventListener('controllerchange', reloadOnNewSW)
    document.addEventListener('visibilitychange', onVisible)
    sw.register('/pulse-sw.js', { scope: '/pulse' }).then(() => checkForUpdate()).catch(() => {})

    return () => {
      sw.removeEventListener('controllerchange', reloadOnNewSW)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  return (
    <PulseGate>
      <PulseApp />
    </PulseGate>
  )
}
