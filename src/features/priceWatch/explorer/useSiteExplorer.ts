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
import type { CompetitorListing } from '../catalog/prestashop'
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
}

/** Catalogue source du suivi : la base de l'appariement ET des écarts de prix. */
export function useSourceCatalog(watchId: string | null): SourceCatalogState {
  const uid = useWorkspaceUid()
  const [state, setState] = useState<SourceCatalogState>({ products: [], vatRate: DEFAULT_VAT_RATE, loading: false, absent: false, partial: false, expected: 0, sourceRows: 0 })

  useEffect(() => {
    if (!uid || !watchId) { setState({ products: [], vatRate: DEFAULT_VAT_RATE, loading: false, absent: false, partial: false, expected: 0, sourceRows: 0 }); return }
    let cancelled = false
    setState((s) => ({ ...s, loading: true }))
    loadSourceCatalog(uid, watchId)
      .then((src) => {
        if (cancelled) return
        debugLog('[pw-explorer] catalogue source', src ? `${src.products.length} produits, TVA ${src.vatRate}` : 'absent')
        if (src?.partial) {
          console.warn('[pw-explorer] catalogue source AMPUTÉ :', src.products.length, '/', src.expected)
        }
        setState({
          products: src?.products ?? [], vatRate: src?.vatRate ?? DEFAULT_VAT_RATE,
          loading: false, absent: src == null,
          partial: !!src?.partial, expected: src?.expected ?? 0, sourceRows: src?.sourceRows ?? 0,
        })
      })
      .catch((e) => {
        if (cancelled) return
        console.error('[pw-explorer] catalogue source illisible', e)
        setState({ products: [], vatRate: DEFAULT_VAT_RATE, loading: false, absent: true, partial: false, expected: 0, sourceRows: 0 })
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
    if (!uid || !watchId || !siteId) { setListings([]); setError(null); return }
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
