// La liste de MON catalogue, sans concurrent.
//
// L'explorateur ne montre que les fiches du marchand sélectionné : chercher « carburateur »
// y rend « 0 sur 103 412 » dès que CE marchand n'en vend pas, et les 103 412 restaient
// inaccessibles. C'est pourtant le catalogue de référence — celui qu'on interroge pour
// savoir ce qu'on vend, avant de regarder qui d'autre le vend.
import { useMemo, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { intlLocale, useTranslation } from '@/lib/i18n'
import { searchCatalog, catalogFacts } from './catalogList'
import type { SourceProduct } from '../catalog/match'

/** Produits rendus d'un coup. Au-delà, le navigateur peine et le défilement saccade —
 *  et personne ne parcourt cent mille lignes à la main : on affine la recherche. */
const PAGE = 200

export function ExplorerCatalog({ products, query, imagePrefix }: {
  products: SourceProduct[]
  /** La saisie du bandeau : la même que pour les concurrents, pour ne pas retaper. */
  query: string
  imagePrefix?: string
}) {
  const { t, locale } = useTranslation()
  const n = (v: number) => v.toLocaleString(intlLocale(locale))
  const [shown, setShown] = useState(PAGE)

  const found = useMemo(() => searchCatalog(products, query), [products, query])
  const facts = useMemo(() => catalogFacts(products, found), [products, found])
  // Une nouvelle recherche repart du début : garder « 800 affichés » d'une requête
  // précédente donnerait une page en apparence pleine sur un résultat qui l'est moins.
  const visible = useMemo(() => found.slice(0, shown), [found, shown])

  const imageOf = (p: SourceProduct) => {
    if (!p.image) return null
    return /^https?:/i.test(p.image) ? p.image : `${imagePrefix ?? ''}${p.image}`
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="flex items-baseline gap-3 px-3 py-1.5 border-b border-white/[0.06] text-[11px] text-white/40">
        <span className="font-medium text-white/70">{t('pwx.catalog.title')}</span>
        <span className="tabular-nums">
          {query.trim()
            ? t('pwx.catalog.found', { shown: n(facts.shown), total: n(facts.total) })
            : t('pwx.catalog.all', { total: n(facts.total) })}
        </span>
        <span className="ml-auto tabular-nums">
          {t('pwx.catalog.facts', { price: n(facts.withPrice), image: n(facts.withImage) })}
        </span>
      </div>

      {found.length === 0 ? (
        <p className="p-6 text-center text-[12px] text-white/35">{t('pwx.catalog.none')}</p>
      ) : (
        <div className="flex-1 min-h-0 overflow-auto">
          <ul>
            {visible.map((p) => {
              const img = imageOf(p)
              return (
                <li key={p.id} className="flex gap-3 px-3 py-2 border-b border-white/[0.04] hover:bg-white/[0.02]">
                  <div className="w-10 h-10 shrink-0 rounded bg-white/[0.04] overflow-hidden">
                    {img && <img src={img} alt="" className="w-full h-full object-contain" loading="lazy" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      {p.ref && <span className="text-[10px] tabular-nums text-white/35 shrink-0">{p.ref}</span>}
                      {p.ean && <span className="text-[10px] tabular-nums text-emerald-300/60 shrink-0">{p.ean}</span>}
                      {p.url && (
                        <a href={p.url} target="_blank" rel="noreferrer"
                          className="text-white/30 hover:text-indigo-300 shrink-0" title={t('pwx.catalog.openSheet')}>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                      {typeof p.price === 'number' && (
                        <span className="ml-auto text-[12px] tabular-nums text-white/70 shrink-0">
                          {p.price.toLocaleString(intlLocale(locale), { style: 'currency', currency: 'EUR' })}
                        </span>
                      )}
                    </div>
                    <p className="truncate text-[12px] text-white/80">{p.name || '—'}</p>
                    {p.taxo && p.taxo.length > 0 && (
                      <p className="truncate text-[10px] text-white/25">{p.taxo.join(' › ')}</p>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
          {/* Chargement à la demande plutôt qu'une pagination : on cherche ici, on ne
              feuillette pas — et un numéro de page n'a aucun sens sur cent mille lignes. */}
          {visible.length < found.length && (
            <button type="button" onClick={() => setShown((s) => s + PAGE)}
              className="w-full py-2 text-[11px] text-white/45 hover:text-white hover:bg-white/[0.04]">
              {t('pwx.catalog.more', { count: n(Math.min(PAGE, found.length - visible.length)), rest: n(found.length - visible.length) })}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
