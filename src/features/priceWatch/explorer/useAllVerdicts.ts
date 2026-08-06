// Verdicts d'audit de PLUSIEURS concurrents à la fois — l'état que réclame la compilation.
//
// ⚠ Pourquoi un hook séparé de `useVerdicts`. Celui-ci est clefé sur UN site : réutilisé
// tel quel dans la compilation, il lirait et surtout ÉCRIRAIT les jugements dans le
// document du concurrent affiché, pour des lignes appartenant à vingt-trois autres. La
// faute serait silencieuse et corromprait un travail qui, lui, survit aux sessions.
//
// Un document de verdicts par concurrent (cf. `verdictStore`) : on en charge autant que de
// sites compilés, en parallèle, une seule fois par balayage.
import { useCallback, useEffect, useRef, useState } from 'react'
import { useWorkspaceUid } from '@/features/access/useWorkspaceUid'
import { loadVerdicts, saveVerdict, urlKey, type Verdict } from './verdictStore'
import { debugLog } from '@/lib/debugLog'

export interface AllVerdictsState {
  of: (siteId: string, url: string) => Verdict | null
  /** Pose le verdict, ou le retire si c'est déjà celui-là (clic sur un bouton actif). */
  set: (siteId: string, url: string, verdict: Verdict) => void
  counts: { ok: number; ko: number }
  loading: boolean
}

/** La clé porte le SITE : deux concurrents peuvent référencer la même adresse dans un cas
 *  de marketplace, et deux fiches distinctes ne partagent jamais un jugement. */
const cellKey = (siteId: string, url: string) => `${siteId}|${urlKey(url)}`

export function useAllVerdicts(watchId: string | null, siteIds: string[]): AllVerdictsState {
  const uid = useWorkspaceUid()
  const [map, setMap] = useState<Map<string, Verdict>>(new Map())
  const [loading, setLoading] = useState(false)
  // La liste des sites change d'identité à chaque rendu de l'appelant ; c'est son CONTENU
  // qui doit déclencher la relecture, sinon l'effet boucle.
  const key = siteIds.join('|')
  const idsRef = useRef(siteIds)
  idsRef.current = siteIds

  useEffect(() => {
    const ids = idsRef.current
    if (!uid || !watchId || ids.length === 0) { setMap(new Map()); return }
    let cancelled = false
    setLoading(true)
    Promise.all(ids.map((siteId) =>
      loadVerdicts(uid, watchId, siteId)
        .then((v) => ({ siteId, v }))
        .catch(() => ({ siteId, v: new Map<string, Verdict>() })),
    ))
      .then((all) => {
        if (cancelled) return
        const merged = new Map<string, Verdict>()
        for (const { siteId, v } of all) for (const [k, verdict] of v) merged.set(`${siteId}|${k}`, verdict)
        debugLog('[pw-explorer] verdicts compilés', ids.length, 'sites,', merged.size, 'jugements')
        setMap(merged); setLoading(false)
      })
    return () => { cancelled = true }
  }, [uid, watchId, key])

  // ⚠ Identité STABLE tant que la carte ne change pas : `of` sert de dépendance à des
  // mémos qui parcourent des milliers de lignes.
  const of = useCallback(
    (siteId: string, url: string) => map.get(cellKey(siteId, url)) ?? null,
    [map],
  )

  // Écriture OPTIMISTE, comme dans l'onglet d'un site : statuer se fait en rafale, et un
  // aller-retour Firestore par clic rendrait la revue pénible. En cas d'échec, l'état
  // revient et l'erreur remonte.
  const set = useCallback((siteId: string, url: string, verdict: Verdict) => {
    if (!uid || !watchId) return
    const k = cellKey(siteId, url)
    const previous = map.get(k) ?? null
    const next = previous === verdict ? null : verdict
    setMap((m) => {
      const copy = new Map(m)
      if (next) copy.set(k, next); else copy.delete(k)
      return copy
    })
    // ⚠ L'écriture reste HORS de l'updater : React rejoue les updaters (mode strict), et
    // un effet de bord placé là partirait deux fois vers Firestore.
    saveVerdict(uid, watchId, siteId, url, next).catch((e) => {
      console.error('[pw-explorer] verdict non enregistré', e)
      setMap((m) => {
        const back = new Map(m)
        if (previous) back.set(k, previous); else back.delete(k)
        return back
      })
    })
  }, [uid, watchId, map])

  let ok = 0, ko = 0
  for (const v of map.values()) if (v === 'ok') ok++; else ko++

  return { of, set, counts: { ok, ko }, loading }
}
