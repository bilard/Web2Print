// Verdicts visuels du concurrent affiché. LECTURE SEULE : la passe d'analyse est le
// travail du node « Comparer les visuels », l'écran ne fait que restituer ce qu'elle a
// produit — sinon consulter un onglet déclencherait des appels payants à l'insu de qui
// regarde.
import { useCallback, useEffect, useState } from 'react'
import { useWorkspaceUid } from '@/features/access/useWorkspaceUid'
import { loadVisuals, urlKey, type StoredVisual, type VisualMap } from './visualStore'
import { debugLog } from '@/lib/debugLog'

export interface VisualsState {
  of: (url: string) => StoredVisual | null
  /** Nombre de paires jugées, pour la couverture affichée à côté de la statistique. */
  size: number
  loading: boolean
}

export function useVisuals(watchId: string | null, siteId: string | null): VisualsState {
  const uid = useWorkspaceUid()
  const [map, setMap] = useState<VisualMap>(new Map())
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!uid || !watchId || !siteId) { setMap(new Map()); return }
    let cancelled = false
    setLoading(true)
    loadVisuals(uid, watchId, siteId)
      .then((v) => {
        if (cancelled) return
        debugLog('[pw-visual] verdicts visuels', siteId, v.size)
        setMap(v); setLoading(false)
      })
      .catch(() => { if (!cancelled) { setMap(new Map()); setLoading(false) } })
    return () => { cancelled = true }
  }, [uid, watchId, siteId])

  // ⚠ Identité STABLE tant que la carte ne change pas : `of` sert de dépendance à des
  // mémos qui parcourent des centaines de milliers de lignes. Recréé à chaque rendu, il
  // les faisait tous rejouer pour rien.
  const of = useCallback((url: string) => map.get(urlKey(url)) ?? null, [map])

  return { of, size: map.size, loading }
}
