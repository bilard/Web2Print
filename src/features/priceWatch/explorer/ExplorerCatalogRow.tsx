// Une fiche de MON catalogue dans la liste « Mon catalogue ».
//
// Extraite de `ExplorerCatalog` : la liste ne fait plus que découper la fenêtre à rendre,
// la ligne porte tout ce qui se lit d'un produit — visuel, clés, prix, textes, et la
// bascule vers les textes d'ORIGINE quand la feuille en garde la mémoire.
import { ExternalLink, Languages } from 'lucide-react'
import { intlLocale, useTranslation } from '@/lib/i18n'
import type { SourceProduct } from '../catalog/match'

export function ExplorerCatalogRow({ product, imagePrefix, showSource, onToggleSource }: {
  product: SourceProduct
  imagePrefix?: string
  /** Afficher les textes AVANT enrichissement au lieu des textes courants. */
  showSource: boolean
  onToggleSource: () => void
}) {
  const { t, locale } = useTranslation()
  const p = product
  const img = !p.image ? null : /^https?:/i.test(p.image) ? p.image : `${imagePrefix ?? ''}${p.image}`
  const name = showSource && p.nameSource ? p.nameSource : p.name
  const desc = showSource && p.descriptionSource ? p.descriptionSource : p.description

  return (
    <li className="flex gap-3 px-3 py-2 border-b border-white/[0.04] hover:bg-white/[0.02]">
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
        <p className={`truncate text-[12px] ${showSource ? 'text-amber-200/80' : 'text-white/80'}`}>
          {name || '—'}
        </p>
        {desc && (
          <p className={`line-clamp-2 text-[11px] ${showSource ? 'text-amber-200/50' : 'text-white/40'}`}>
            {desc}
          </p>
        )}
        {/* N'apparaît que si la feuille porte la mémoire de l'original :
            un catalogue jamais enrichi n'a rien à montrer. */}
        {(p.nameSource || p.descriptionSource) && (
          <button type="button" onClick={onToggleSource}
            className={`mt-0.5 inline-flex items-center gap-1 rounded px-1 py-px text-[9px] font-medium uppercase tracking-wide border transition-colors ${
              showSource
                ? 'text-amber-200 bg-amber-500/15 border-amber-500/35'
                : 'text-white/40 border-white/15 hover:text-white/70 hover:border-white/30'
            }`}
            title={t('pwx.original.help')}>
            <Languages className="w-2.5 h-2.5" />
            {showSource ? t('pwx.original.showing') : t('pwx.original.show')}
          </button>
        )}
        {p.taxo && p.taxo.length > 0 && (
          <p className="truncate text-[10px] text-white/25">{p.taxo.join(' › ')}</p>
        )}
      </div>
    </li>
  )
}
