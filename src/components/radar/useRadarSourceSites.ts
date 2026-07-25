import { useCallback, useEffect, useState } from 'react'
import { useAuthStore } from '@/stores/auth.store'
import { normalizeDomain, type SourceSiteRow } from '@/features/priceWatch/sourceSites'
import { loadSourceSites } from '@/features/priceWatch/radar/radarSiteActions'
import { stableId } from '@/features/priceWatch/core'

export interface SourceSitesState {
  /** Config par site, indexée par `stableId(domaine)`. Vide tant que non chargée. */
  byId: Map<string, SourceSiteRow>
  /** false = ce suivi n'a pas de node « Sites sources » → options de config indisponibles. */
  editable: boolean
  /** À rappeler après chaque écriture (la config vit dans le doc workflow, pas en live). */
  reload: () => void
}

/** Config des concurrents (node « Sites sources » du workflow) : activation, moteur forcé,
 *  accès connecté. Lue à la demande — contrairement aux métas de moisson, elle ne change
 *  qu'à l'initiative de l'utilisateur. */
export function useRadarSourceSites(workflowId: string | null): SourceSitesState {
  const uid = useAuthStore((s) => s.user?.uid)
  const [byId, setById] = useState<Map<string, SourceSiteRow>>(() => new Map())
  const [editable, setEditable] = useState(false)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!uid || !workflowId) { setById(new Map()); setEditable(false); return }
    let alive = true
    loadSourceSites(uid, workflowId)
      .then((cfg) => {
        if (!alive) return
        setEditable(!!cfg)
        setById(new Map((cfg?.rows ?? []).map((r) => [stableId(normalizeDomain(r.domain)), r])))
      })
      .catch(() => { if (alive) { setById(new Map()); setEditable(false) } })
    return () => { alive = false }
  }, [uid, workflowId, tick])

  const reload = useCallback(() => setTick((t) => t + 1), [])
  return { byId, editable, reload }
}
