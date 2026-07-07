import { useEffect } from 'react'
import { PulseGate } from '@/components/pulse/PulseGate'
import { PulseApp } from '@/components/pulse/PulseApp'
import '@/components/pulse/pulse.css'

/** Route `/pulse` : la PWA mobile de suivi du trafic ibs-studio.com. */
export default function PulsePage() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    // Scope /pulse : le worker ne contrôle que cette PWA, jamais le reste du site.
    void navigator.serviceWorker.register('/pulse-sw.js', { scope: '/pulse' }).catch(() => {})
  }, [])

  return (
    <PulseGate>
      <PulseApp />
    </PulseGate>
  )
}
