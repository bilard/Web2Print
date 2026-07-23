import { useEffect } from 'react'
import { RadarGate } from '@/components/radar/RadarGate'
import { RadarApp } from '@/components/radar/RadarApp'
import '@/components/radar/radar.css'

/** Route `/radarprice` : la PWA mobile de veille tarifaire (jumelle mobile du dashboard). */
export default function RadarPage() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    // En dev, le SW (cache-first) interfère avec le HMR de Vite → uniquement en production.
    // Scope /radarprice : il ne contrôle que cette PWA, jamais le reste du site.
    if (!import.meta.env.PROD) return
    const sw = navigator.serviceWorker

    let reloading = false
    const reloadOnNewSW = () => { if (reloading) return; reloading = true; window.location.reload() }
    const checkForUpdate = () => { void sw.getRegistration('/radarprice').then((r) => r?.update()).catch(() => {}) }
    const onVisible = () => { if (document.visibilityState === 'visible') checkForUpdate() }

    sw.addEventListener('controllerchange', reloadOnNewSW)
    document.addEventListener('visibilitychange', onVisible)
    sw.register('/radarprice-sw.js', { scope: '/radarprice' }).then(() => checkForUpdate()).catch(() => {})

    return () => {
      sw.removeEventListener('controllerchange', reloadOnNewSW)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  return (
    <RadarGate>
      <RadarApp />
    </RadarGate>
  )
}
