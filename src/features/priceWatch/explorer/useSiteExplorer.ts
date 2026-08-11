// Chargement des données de l'explorateur : catalogue source (une fois par suivi) et
// fiches du concurrent ACTIF (une fois par onglet).
//
// ⚠ Un seul site en mémoire à la fois. `loadAllListings` lit TOUTE la collection de
// pages d'un concurrent — plusieurs centaines de documents, plusieurs Mo une fois
// désérialisés. Précharger les 19 onglets ferait tomber l'onglet navigateur ; c'est la
// raison d'être des onglets, pas une préférence d'affichage.
import { useEffect, useState } from 'react'
import { useWorkspaceUid } from '@/features/access/useWorkspaceUid'
import { loadAllListings } from '../catalog/store'
import { loadSourceCatalog } from '../reportStore'
import type { CompetitorListing } from '../catalog/competitorListing'
import { DEFAULT_VAT_RATE, type SourceProduct } from '../catalog/match'
import { debugLog } from '@/lib/debugLog'

export interface SourceCatalogState {
  products: SourceProduct[]
  vatRate: number
  loading: boolean
  /** Le catalogue source n'a jamais été persisté (aucun « Comparer catalogue » abouti). */
  absent: boolean
  /** Des tranches manquent : ce qui est relu est amputé, les appariés seront sous-comptés. */
  partial: boolean
  /** Produits annoncés à la dernière écriture (pour chiffrer l'écart). */
  expected: number
  /** Lignes reçues par le node « Comparer catalogue » lors de cette écriture. */
  sourceRows: number
  /** Avancement de la relecture, en TRANCHES (0/0 tant que `_meta` n'a pas répondu).
   *  `expected` = produits annoncés, connu dès la première réponse. */
  progress: { done: number; total: number; expected: number }
  /** Poids relu et part d'affichage seul (cf. LoadedSourceCatalog), + durée. */
  bytes: number
  displayBytes: number
  ms: number
}

const IDLE_SOURCE: SourceCatalogState = {
  products: [], vatRate: DEFAULT_VAT_RATE, loading: false, absent: false,
  partial: false, expected: 0, sourceRows: 0, progress: { done: 0, total: 0, expected: 0 },
  bytes: 0, displayBytes: 0, ms: 0,
}

/** Catalogue source du suivi : la base de l'appariement ET des écarts de prix. */
export function useSourceCatalog(watchId: string | null): SourceCatalogState {
  const uid = useWorkspaceUid()
  const [state, setState] = useState<SourceCatalogState>(IDLE_SOURCE)

  useEffect(() => {
    if (!uid || !watchId) { setState(IDLE_SOURCE); return }
    let cancelled = false
    setState((s) => ({ ...s, loading: true, progress: { done: 0, total: 0, expected: 0 } }))
    const t0 = performance.now()
    // Tracé à CHAQUE entrée : si cette ligne se répète, la lenteur n'est pas la lecture
    // mais un effet qui se relance (la progression repartirait sans cesse de zéro).
    debugLog('[pw-explorer] relecture du catalogue source — début')
    loadSourceCatalog(uid, watchId, (done, total, expected) => {
      if (!cancelled) setState((s) => ({ ...s, progress: { done, total, expected } }))
    })
      .then((src) => {
        if (cancelled) return
        debugLog('[pw-explorer] catalogue source',
          src ? `${src.products.length} produits, TVA ${src.vatRate}, ~${Math.round((src.bytes / 1e6) * 10) / 10} Mo dont ${Math.round((src.displayBytes / 1e6) * 10) / 10} Mo d'affichage seul` : 'absent',
          'en', Math.round(performance.now() - t0), 'ms')
        if (src?.partial) {
          console.warn('[pw-explorer] catalogue source AMPUTÉ :', src.products.length, '/', src.expected)
        }
        setState((s) => ({
          products: src?.products ?? [], vatRate: src?.vatRate ?? DEFAULT_VAT_RATE,
          loading: false, absent: src == null,
          partial: !!src?.partial, expected: src?.expected ?? 0, sourceRows: src?.sourceRows ?? 0,
          progress: s.progress,
          bytes: src?.bytes ?? 0, displayBytes: src?.displayBytes ?? 0, ms: src?.ms ?? 0,
        }))
      })
      .catch((e) => {
        if (cancelled) return
        console.error('[pw-explorer] catalogue source illisible', e)
        setState({ ...IDLE_SOURCE, absent: true })
      })
    return () => { cancelled = true }
  }, [uid, watchId])

  return state
}

export interface SiteListingsState {
  listings: CompetitorListing[]
  loading: boolean
  error: string | null
  /** Incrémenter pour relire le site (bouton ↻) — aucune donnée n'est mise en cache. */
  reload: () => void
}

/** Fiches collectées chez UN concurrent. Rechargées à chaque changement d'onglet. */
export function useSiteListings(watchId: string | null, siteId: string | null): SiteListingsState {
  const uid = useWorkspaceUid()
  const [listings, setListings] = useState<CompetitorListing[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    // ⚠ `setLoading(false)` obligatoire ici : si l'effet se relance pendant un chargement
    // (le rail se vide un instant sur un snapshot → `siteId` repasse à null), la passe
    // précédente est marquée `cancelled` et ne rendra JAMAIS la main — sans ce reset,
    // l'écran reste figé sur « Lecture des fiches collectées… ».
    if (!uid || !watchId || !siteId) { setListings([]); setError(null); setLoading(false); return }
    let cancelled = false
    setLoading(true); setError(null)
    // Libère l'index précédent AVANT de charger le suivant : deux sites simultanés en
    // mémoire, c'est exactement ce que les onglets doivent empêcher.
    setListings([])
    const t0 = performance.now()
    loadAllListings(uid, watchId, siteId)
      .then((rows) => {
        if (cancelled) return
        debugLog('[pw-explorer]', siteId, rows.length, 'fiches en', Math.round(performance.now() - t0), 'ms')
        setListings(rows); setLoading(false)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        console.error('[pw-explorer] lecture des fiches impossible', e)
        setError(e instanceof Error ? e.message : String(e))
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [uid, watchId, siteId, tick])

  return { listings, loading, error, reload: () => setTick((n) => n + 1) }
}
