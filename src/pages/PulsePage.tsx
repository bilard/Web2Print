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
    if (import.meta.env.PROD) {
      void navigator.serviceWorker.register('/pulse-sw.js', { scope: '/pulse' }).catch(() => {})
    }
  }, [])

  return (
    <PulseGate>
      <PulseApp />
    </PulseGate>
  )
}
