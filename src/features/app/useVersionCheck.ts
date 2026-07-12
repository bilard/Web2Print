// src/features/app/useVersionCheck.ts
// Détection des déploiements : l'app (SPA) reste sur son bundle tant que
// l'onglet n'est pas rechargé — on polle /version.json (émis à chaque build,
// cf. vite.config.ts) et on propose « Recharger » dès qu'un build plus récent
// est en ligne. Toast unique, persistant, jamais de reload forcé.
import { useEffect } from 'react'
import { toast } from 'sonner'

const CHECK_EVERY_MS = 5 * 60_000
const FIRST_CHECK_MS = 30_000

export function useVersionCheck() {
  useEffect(() => {
    if (!import.meta.env.PROD) return
    let notified = false
    const check = async () => {
      if (notified || document.hidden) return
      try {
        const r = await fetch(`/version.json?_=${Date.now()}`, { cache: 'no-store' })
        if (!r.ok) return
        const { buildId } = (await r.json()) as { buildId?: string }
        if (!buildId || buildId === __BUILD_ID__) return
        notified = true
        toast.info('Nouvelle version disponible', {
          description: 'Une mise à jour vient d’être déployée — rechargez pour en profiter.',
          duration: Infinity,
          action: { label: 'Recharger', onClick: () => window.location.reload() },
        })
      } catch {
        // Hors ligne / réseau : on retentera au prochain tick.
      }
    }
    const first = setTimeout(check, FIRST_CHECK_MS)
    const every = setInterval(check, CHECK_EVERY_MS)
    window.addEventListener('focus', check)
    return () => {
      clearTimeout(first)
      clearInterval(every)
      window.removeEventListener('focus', check)
    }
  }, [])
}
