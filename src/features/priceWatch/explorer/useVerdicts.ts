// État des verdicts d'audit du concurrent affiché. Écriture OPTIMISTE : la ligne change
// d'aspect au clic, sans attendre l'aller-retour Firestore — statuer se fait en rafale sur
// des dizaines de fiches, un demi-quart de seconde d'attente par clic rendrait la revue
// pénible. En cas d'échec, l'état revient et l'erreur remonte.
import { useCallback, useEffect, useState } from 'react'
import { useWorkspaceUid } from '@/features/access/useWorkspaceUid'
import { loadVerdicts, saveVerdict, urlKey, type Verdict, type VerdictMap } from './verdictStore'
import { debugLog } from '@/lib/debugLog'

export interface VerdictsState {
  /** Verdict d'une fiche, par son URL. */
  of: (url: string) => Verdict | null
  /** Pose le verdict, ou le retire si c'est déjà celui-là (clic sur un bouton actif). */
  set: (url: string, verdict: Verdict) => void
  counts: { ok: number; ko: number }
  loading: boolean
}

export function useVerdicts(watchId: string | null, siteId: string | null): VerdictsState {
  const uid = useWorkspaceUid()
  const [map, setMap] = useState<VerdictMap>(new Map())
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!uid || !watchId || !siteId) { setMap(new Map()); return }
    let cancelled = false
    setLoading(true)
    loadVerdicts(uid, watchId, siteId)
      .then((v) => {
        if (cancelled) return
        debugLog('[pw-explorer] verdicts', siteId, v.size)
        setMap(v); setLoading(false)
      })
      .catch(() => { if (!cancelled) { setMap(new Map()); setLoading(false) } })
    return () => { cancelled = true }
  }, [uid, watchId, siteId])

  const of = useCallback((url: string) => map.get(urlKey(url)) ?? null, [map])

  const set = useCallback((url: string, verdict: Verdict) => {
    if (!uid || !watchId || !siteId) return
    const k = urlKey(url)
    const previous = map.get(k) ?? null
    const next = previous === verdict ? null : verdict
    setMap((m) => {
      const copy = new Map(m)
      if (next) copy.set(k, next); else copy.delete(k)
      return copy
    })
    saveVerdict(uid, watchId, siteId, url, next).catch((e) => {
      console.error('[pw-explorer] verdict non enregistré', e)
      setMap((m) => {
        const copy = new Map(m)
        if (previous) copy.set(k, previous); else copy.delete(k)
        return copy
      })
    })
  }, [uid, watchId, siteId, map])

  let ok = 0, ko = 0
  for (const v of map.values()) if (v === 'ok') ok++; else ko++

  return { of, set, counts: { ok, ko }, loading }
}
