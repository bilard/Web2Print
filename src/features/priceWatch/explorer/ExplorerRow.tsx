// Une ligne de l'explorateur : mon produit F1 à GAUCHE, la fiche du concurrent à DROITE.
//
// Parti pris d'implantation : les vignettes F1 sont collées au séparateur central et
// celle du concurrent juste après — les deux visuels sont donc ADJACENTS. C'est la
// finalité de l'écran (« est-ce bien le même produit ? ») ; les mettre chacun au bord
// extérieur de sa colonne obligerait à balayer la ligne des yeux pour comparer.
import { useState } from 'react'
import { ImageOff, ChevronDown } from 'lucide-react'
import type { PairedRow } from './pairing'
import { discountPct } from './pairing'
import { eur, pct } from '../dashboard/format'
import { useTranslation, type TranslationKey } from '@/lib/i18n'

// ⚠ Clés de traduction, pas libellés : un t() en constante de module fige la langue à
// l'import. La résolution se fait dans le rendu, via useTranslation.
// Le badge dit COMMENT l'appariement a été prouvé — et donc quelle confiance lui
// accorder. Son infobulle l'explique : sans elle, « RÉF » et « ORIGINE » se ressemblent
// alors que le second est une correspondance indirecte.
const KIND_BADGE: Record<string, { key: TranslationKey; help: TranslationKey; cls: string }> = {
  'exact-ean': { key: 'pwx.badge.ean', help: 'pwx.badge.ean.help', cls: 'text-emerald-300 border-emerald-400/30' },
  'exact-ref': { key: 'pwx.badge.ref', help: 'pwx.badge.ref.help', cls: 'text-sky-300 border-sky-400/30' },
  origin: { key: 'pwx.badge.origin', help: 'pwx.badge.origin.help', cls: 'text-amber-300 border-amber-400/30' },
}

const STOCK_LABEL: Record<string, { key: TranslationKey; cls: string }> = {
  'in-stock': { key: 'pwx.inStock', cls: 'text-emerald-300' },
  'out-of-stock': { key: 'pwx.outOfStock', cls: 'text-rose-300' },
  'on-order': { key: 'pwx.onOrder', cls: 'text-amber-300' },
}

function Thumb({ src, alt, size = 'h-16 w-16' }: { src: string | null; alt: string; size?: string }) {
  if (!src) {
    return (
      <div className={`${size} shrink-0 rounded bg-well border border-white/10 flex items-center justify-center`}>
        <ImageOff className="w-4 h-4 text-white/20" />
      </div>
    )
  }
  return (
    <img src={src} alt={alt} loading="lazy"
      className={`${size} shrink-0 rounded object-contain bg-[#fff] border border-white/10`} />
  )
}

/** Écart concurrent vs mon prix : négatif = il est moins cher (alerte). */
function gapTone(gap: number | null): string {
  if (gap == null) return 'text-white/30'
  if (gap < -1) return 'text-rose-300'
  if (gap > 1) return 'text-emerald-300'
  return 'text-white/60'
}

export function ExplorerRow({ row }: { row: PairedRow }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const { listing, cmp, source, kind } = row
  const gap = cmp.deltaPct ?? null
  const promo = discountPct(listing)
  const stock = listing.availability ? STOCK_LABEL[listing.availability] : null

  return (
    <div className="grid grid-cols-2 gap-0 border-t border-white/5 hover:bg-white/[0.02]">
      {/* ── Mon produit (F1) ─────────────────────────────────────────────── */}
      <div className="flex items-start gap-3 p-2.5 pr-3 min-w-0">
        {source ? (
          <>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap text-[10px] tabular-nums">
                {/* Préfixes explicites : deux suites de chiffres côte à côte ne se
                    distinguent pas d'un coup d'œil, et on cherche l'une OU l'autre. */}
                <span className="text-white/70 font-medium">
                  <span className="text-white/30 font-normal mr-1">{t('pwx.badge.ref')}</span>
                  {source.ref ?? '—'}
                </span>
                <span className="text-white/45">
                  <span className="text-white/30 mr-1">{t('pwx.badge.ean')}</span>
                  {source.ean ?? t('pwx.noEan')}
                </span>
                {kind && (
                  <span title={t(KIND_BADGE[kind].help)}
                    className={`px-1 rounded border text-[9px] uppercase tracking-wide cursor-help ${KIND_BADGE[kind].cls}`}>
                    {t(KIND_BADGE[kind].key)}
                  </span>
                )}
              </div>
              {source.url ? (
                <a href={source.url} target="_blank" rel="noopener noreferrer" title={t('pw.table.openSource')}
                  className="block text-xs text-white/90 leading-snug mt-0.5 break-words underline decoration-dotted decoration-white/30 underline-offset-[3px] hover:text-indigo-300 hover:decoration-solid">
                  {source.name}
                </a>
              ) : (
                <div className="text-xs text-white/90 leading-snug mt-0.5 break-words">{source.name}</div>
              )}
              {source.description && (
                <button type="button" onClick={() => setOpen((o) => !o)}
                  className="mt-1 text-left text-[11px] text-white/45 hover:text-white/70 flex items-start gap-1">
                  <ChevronDown className={`w-3 h-3 mt-0.5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
                  <span className={open ? '' : 'line-clamp-2'}>{source.description}</span>
                </button>
              )}
              <div className="mt-1 text-[11px] tabular-nums text-white/70">
                {t('pwx.monPrixHt')} <span className="text-white/90 font-medium">{eur(source.priceHt)}</span>
              </div>
            </div>
            {/* Visuels F1, collés au séparateur central. */}
            <div className="flex gap-1 shrink-0">
              {source.images.length === 0
                ? <Thumb src={null} alt="" />
                : source.images.slice(0, 2).map((u) => <Thumb key={u} src={u} alt={source.name} />)}
            </div>
          </>
        ) : (
          <div className="text-[11px] text-white/25 italic py-4">
            {t('pwx.aucunProduitF1Apparie')}
          </div>
        )}
      </div>

      {/* ── Fiche du concurrent ──────────────────────────────────────────── */}
      <div className="flex items-start gap-3 p-2.5 pl-3 border-l border-white/10 min-w-0">
        <Thumb src={listing.image ?? null} alt={listing.name} />
        <div className="min-w-0 flex-1">
          <a href={listing.url} target="_blank" rel="noopener noreferrer" title={listing.url}
            className="block text-xs text-white/90 leading-snug break-words underline decoration-dotted decoration-white/30 underline-offset-[3px] hover:text-indigo-300 hover:decoration-solid">
            {listing.name}
          </a>
          {/* Pas de nom de domaine ici : l'onglet actif et l'en-tête de colonne le
              portent déjà. Répété sur chaque ligne, il masquait la référence. */}
          {(listing.ref || listing.gtin13) && (
            <div className="text-[10px] text-white/40 tabular-nums mt-0.5">
              {[listing.ref, listing.gtin13].filter(Boolean).join(' · ')}
            </div>
          )}
          <div className="flex items-baseline gap-2 flex-wrap mt-1 tabular-nums">
            <span className="text-sm text-white/90 font-medium">{eur(cmp.priceHt)}</span>
            <span className="text-[10px] text-white/35">HT</span>
            {cmp.priceTtc != null && <span className="text-[10px] text-white/35">({eur(cmp.priceTtc)} TTC)</span>}
            {gap != null && <span className={`text-xs font-medium ${gapTone(gap)}`}>{pct(gap)}</span>}
          </div>
          <div className="flex items-center gap-2 mt-0.5 text-[10px]">
            {stock && <span className={stock.cls}>{t(stock.key)}</span>}
            {promo != null && (
              <span className="text-amber-300">
                −{promo} % <span className="text-white/30 line-through">{eur(cmp.listPriceTtc)}</span>
              </span>
            )}
            {cmp.priceHt == null && <span className="text-white/30 italic">{t('pwx.prixNonExploitable')}</span>}
          </div>
        </div>
      </div>
    </div>
  )
}
