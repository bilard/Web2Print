// La liste de MON catalogue, sans concurrent.
//
// L'explorateur ne montre que les fiches du marchand sélectionné : chercher « carburateur »
// y rend « 0 sur 103 412 » dès que CE marchand n'en vend pas, et les 103 412 restaient
// inaccessibles. C'est pourtant le catalogue de référence — celui qu'on interroge pour
// savoir ce qu'on vend, avant de regarder qui d'autre le vend.
//
// ⚠ Le composant ne filtre plus : il reçoit la sélection déjà faite (recherche + famille)
// et la FENÊTRE à rendre. C'est le pager de la barre d'outils qui la commande, le même
// que pour les concurrents — un « charger 200 de plus » en pied de liste demandait 578
// clics pour atteindre la fin d'un catalogue de 115 814 produits, et empilait tout en
// mémoire au passage.
import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'
import { ExplorerCatalogRow } from './ExplorerCatalogRow'
import type { SourceProduct } from '../catalog/match'

export function ExplorerCatalog({ products, page, pageSize, imagePrefix, loading }: {
  /** Produits DÉJÀ filtrés par la recherche et la famille choisie. */
  products: SourceProduct[]
  /** Page courante, base 0 — pilotée par `ExplorerPager`. */
  page: number
  pageSize: number
  imagePrefix?: string
  /** Relecture du catalogue en cours : une liste vide n'est pas encore un résultat. */
  loading: boolean
}) {
  const { t } = useTranslation()
  // Bascule AVANT/APRÈS, par produit : on vérifie une traduction fiche par fiche.
  const [showSource, setShowSource] = useState<Set<string>>(new Set())
  const toggleSource = (id: string) => setShowSource((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  const visible = products.slice(page * pageSize, (page + 1) * pageSize)

  if (loading && products.length === 0) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center gap-2 text-[12px] text-white/40">
        <Loader2 className="w-4 h-4 animate-spin" />{t('pwx.source.pending')}
      </div>
    )
  }

  if (products.length === 0) {
    return (
      <div className="flex-1 min-h-0 flex items-start justify-center">
        <p className="p-6 text-center text-[12px] text-white/35">{t('pwx.catalog.none')}</p>
      </div>
    )
  }

  return (
    <div className="flex-1 min-h-0 overflow-auto">
      <ul>
        {visible.map((p) => (
          <ExplorerCatalogRow key={p.id} product={p} imagePrefix={imagePrefix}
            showSource={showSource.has(p.id)} onToggleSource={() => toggleSource(p.id)} />
        ))}
      </ul>
    </div>
  )
}
