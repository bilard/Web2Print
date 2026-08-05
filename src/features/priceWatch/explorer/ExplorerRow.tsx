// Une ligne de l'explorateur : mon produit F1 à GAUCHE, la fiche du concurrent à DROITE.
//
// Parti pris d'implantation : les vignettes F1 sont collées au séparateur central et
// celle du concurrent juste après — les deux visuels sont donc ADJACENTS. C'est la
// finalité de l'écran (« est-ce bien le même produit ? ») ; les mettre chacun au bord
// extérieur de sa colonne obligerait à balayer la ligne des yeux pour comparer.
import { useState } from 'react'
import { ImageOff, ChevronDown, Check, X } from 'lucide-react'
import type { Verdict } from './verdictStore'
import type { PairedRow } from './pairing'
import type { ConfidenceBand, DoubtReason } from './confidence'
import type { CompetitorListing } from '../catalog/prestashop'
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

/** Indice de fiabilité : trois bandes, trois lectures — acquis, à contrôler, suspect. */
const BAND: Record<ConfidenceBand, { key: TranslationKey; cls: string; edge: string }> = {
  sure: { key: 'pwx.trust.sure', cls: 'text-emerald-300 border-emerald-400/30', edge: '' },
  check: { key: 'pwx.trust.check', cls: 'text-amber-300 border-amber-400/40', edge: 'border-l-2 border-l-amber-400/50' },
  doubt: { key: 'pwx.trust.doubt', cls: 'text-rose-300 border-rose-400/50 bg-rose-500/10', edge: 'border-l-2 border-l-rose-400/70 bg-rose-500/[0.04]' },
}

/** Le jugement humain, une fois posé, remplace l'indice sur le badge. */
const VERDICT_BADGE: Record<Verdict, { key: TranslationKey; cls: string }> = {
  ok: { key: 'pwx.verdict.ok', cls: 'text-emerald-300 border-emerald-400/40 bg-emerald-500/10' },
  ko: { key: 'pwx.verdict.ko', cls: 'text-white/40 border-white/20 line-through' },
}

const DOUBT_LABEL: Record<DoubtReason, TranslationKey> = {
  'ean-conflict': 'pwx.doubt.eanConflict',
  'ref-conflict': 'pwx.doubt.refConflict',
  'weak-key': 'pwx.doubt.weakKey',
  'origin-key': 'pwx.doubt.originKey',
  contested: 'pwx.doubt.contested',
  'price-gulf': 'pwx.doubt.priceGulf',
}

const STOCK_LABEL: Record<string, { key: TranslationKey; cls: string }> = {
  'in-stock': { key: 'pwx.inStock', cls: 'text-emerald-300' },
  'out-of-stock': { key: 'pwx.outOfStock', cls: 'text-rose-300' },
  'on-order': { key: 'pwx.onOrder', cls: 'text-amber-300' },
}

function Thumb({ src, alt, size = 'h-16 w-16' }: { src: string | null; alt: string; size?: string }) {
  // Une URL morte laissait l'icône de fichier cassé du navigateur, indiscernable d'un
  // visuel réel tant qu'on ne zoomait pas. On retombe sur le placeholder « aucun visuel ».
  const [broken, setBroken] = useState(false)
  if (!src || broken) {
    return (
      <div className={`${size} shrink-0 rounded bg-well border border-white/10 flex items-center justify-center`}>
        <ImageOff className="w-4 h-4 text-white/20" />
      </div>
    )
  }
  return (
    // `no-referrer` : beaucoup de marchands bloquent le hotlink en lisant le Referer. Sans
    // en-tête, le CDN sert l'image comme à un accès direct.
    <img src={src} alt={alt} loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)}
      className={`${size} shrink-0 rounded object-contain bg-[#fff] border border-white/10`} />
  )
}

/**
 * Visuel du concurrent, rendu absolu contre l'URL de sa fiche. RATTRAPAGE : les relevés
 * déjà stockés portent des chemins relatifs (`/img/p/12.jpg`) — l'extracteur JSON-LD
 * absolutisait l'URL produit mais pas l'image. Corrigé à la source depuis, mais les
 * milliers de fiches en base ne seront réécrites qu'au prochain balayage complet.
 */
function listingImage(l: CompetitorListing): string | null {
  const raw = l.image
  if (!raw) return null
  if (/^(?:https?:|data:)/i.test(raw)) return raw
  try { return new URL(raw, l.url).toString() } catch { return null }
}

/** Écart concurrent vs mon prix : négatif = il est moins cher (alerte). */
function gapTone(gap: number | null): string {
  if (gap == null) return 'text-white/30'
  if (gap < -1) return 'text-rose-300'
  if (gap > 1) return 'text-emerald-300'
  return 'text-white/60'
}

/** Boutons de jugement : le geste d'audit, sur la ligne même. Un second clic sur le
 *  bouton actif ANNULE le verdict — se tromper de touche ne doit pas être définitif. */
function VerdictButtons({ verdict, onSet }: { verdict: Verdict | null; onSet: (v: Verdict) => void }) {
  const { t } = useTranslation()
  const cls = (on: boolean, tone: string) =>
    `p-1 rounded border transition-colors ${on ? tone : 'border-transparent text-white/20 hover:text-white/60 hover:bg-white/[0.06]'}`
  return (
    <div className="flex items-center gap-0.5 shrink-0">
      <button type="button" onClick={() => onSet('ok')} title={t('pwx.verdict.ok.help')}
        className={cls(verdict === 'ok', 'bg-emerald-500/15 border-emerald-400/40 text-emerald-300')}>
        <Check className="w-3.5 h-3.5" />
      </button>
      <button type="button" onClick={() => onSet('ko')} title={t('pwx.verdict.ko.help')}
        className={cls(verdict === 'ko', 'bg-rose-500/15 border-rose-400/40 text-rose-300')}>
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

export function ExplorerRow({ row, onPickBand, verdict, onVerdict, onPickVerdict }: {
  row: PairedRow
  /** Filtre la liste sur la bande cliquée. */
  onPickBand?: (band: ConfidenceBand) => void
  verdict?: Verdict | null
  onVerdict?: (v: Verdict) => void
  /** Filtre la liste sur le verdict cliqué (badge d'une ligne déjà jugée). */
  onPickVerdict?: (v: Verdict) => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const { listing, cmp, source, kind, confidence } = row
  const gap = cmp.deltaPct ?? null
  const promo = discountPct(listing)
  const stock = listing.availability ? STOCK_LABEL[listing.availability] : null
  // L'infobulle NOMME ce qui cloche : c'est là toute la valeur d'audit de l'indice. Sans
  // elle, « 43 » n'apprend rien et l'utilisateur doit rouvrir les deux fiches.
  const why = confidence
    ? [t('pwx.trust.score', { score: confidence.score }), ...confidence.doubts.map((d) => `• ${t(DOUBT_LABEL[d])}`)].join('\n')
    : ''

  // Un verdict humain PRIME sur l'indice : une fois la ligne jugée, l'accent d'alerte
  // s'efface (validée) ou la ligne s'estompe (rejetée). Sans cela, le rouge resterait sur
  // des lignes déjà traitées et l'écran ne montrerait plus ce qui reste à faire.
  const edge = verdict === 'ok' ? 'border-l-2 border-l-emerald-400/50'
    : verdict === 'ko' ? 'border-l-2 border-l-white/15 opacity-45'
    : (confidence ? BAND[confidence.band].edge : '')

  return (
    <div className={`grid grid-cols-2 gap-0 border-t border-white/5 hover:bg-white/[0.02] ${edge}`}>
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
                {confidence && (
                  // Cliquable : le badge est l'endroit où le regard tombe déjà quand un
                  // appariement intrigue. Il isole d'un coup toutes les lignes de son état,
                  // sans avoir à retrouver le filtre dans la barre du haut.
                  //
                  // Une fois la ligne JUGÉE, il porte le verdict et non plus l'indice :
                  // laisser « à vérifier » sur un appariement qu'on vient de valider donne
                  // deux réponses contradictoires sur la même ligne. Le détail de l'indice
                  // reste dans l'infobulle.
                  <button type="button"
                    onClick={() => (verdict ? onPickVerdict?.(verdict) : onPickBand?.(confidence.band))}
                    title={`${why}\n\n${t('pwx.trust.clickToFilter')}`}
                    className={`px-1 rounded border text-[9px] uppercase tracking-wide hover:brightness-125 transition ${
                      verdict ? VERDICT_BADGE[verdict].cls : BAND[confidence.band].cls
                    }`}>
                    {verdict ? t(VERDICT_BADGE[verdict].key) : t(BAND[confidence.band].key)}
                    {!verdict && <span className="ml-1 opacity-60 tabular-nums">{confidence.score}</span>}
                  </button>
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
        <Thumb src={listingImage(listing)} alt={listing.name} />
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
        {/* Jugement, au bout de la ligne : le geste vient APRÈS la comparaison visuelle. */}
        {source && onVerdict && <VerdictButtons verdict={verdict ?? null} onSet={onVerdict} />}
      </div>
    </div>
  )
}
