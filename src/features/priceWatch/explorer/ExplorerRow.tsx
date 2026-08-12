// Une ligne de l'explorateur : mon produit F1 à GAUCHE, la fiche du concurrent à DROITE.
//
// Parti pris d'implantation : les vignettes F1 sont collées au séparateur central et
// celle du concurrent juste après — les deux visuels sont donc ADJACENTS. C'est la
// finalité de l'écran (« est-ce bien le même produit ? ») ; les mettre chacun au bord
// extérieur de sa colonne obligerait à balayer la ligne des yeux pour comparer.
import { useState, type ReactNode } from 'react'
import { ChevronDown, Check, X, Image as ImageIcon, Languages } from 'lucide-react'
import type { Verdict } from './verdictStore'
import type { StoredVisual } from '../visual/visualStore'
import { highlightKey, proofSpot } from './proofHighlight'
import { DOUBT_LABEL } from './doubtLabels'
import type { PairedRow } from './pairing'
import type { ConfidenceBand, SupportReason } from './confidence'
import type { CompetitorListing } from '../catalog/competitorListing'
import { discountPct } from './pairing'
import { eur, pct } from '../dashboard/format'
import { ExplorerThumb } from './ExplorerThumb'
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

/** Verdict de la comparaison des PHOTOS. Signal indépendant de l'indice : celui-ci juge
 *  des clés (référence, code-barres), celui-là des objets. Les afficher côte à côte laisse
 *  l'acheteur trancher — « clés incertaines mais c'est visiblement la même pièce ». */
const VISUAL_BADGE: Record<string, { key: TranslationKey; cls: string }> = {
  same: { key: 'pwx.visual.same', cls: 'text-emerald-300 border-emerald-400/30' },
  different: { key: 'pwx.visual.different', cls: 'text-rose-300 border-rose-400/50 bg-rose-500/10' },
  unclear: { key: 'pwx.visual.unclear', cls: 'text-white/35 border-white/15' },
}

/**
 * Ce qui a PROUVÉ l'appariement, en clair. Indispensable : la bande se décide d'abord sur
 * la nature de la preuve, et une ligne « à vérifier » SANS aucun motif de doute — le cas
 * le plus fréquent — n'affichait qu'un score nu, donc aucune explication.
 */
const EVIDENCE_LABEL: Record<string, TranslationKey> = {
  gtin13: 'pwx.proof.gtin13',
  'ean-in-url': 'pwx.proof.eanInUrl',
  sku: 'pwx.proof.sku',
  mpn: 'pwx.proof.mpn',
  'ref-in-name': 'pwx.proof.refInName',
  'ref-in-url': 'pwx.proof.refInUrl',
  'ref-in-title': 'pwx.proof.refInTitle',
}


/** Ce qui CORROBORE. Affiché depuis que les photos entrent dans l'indice : sans cette
 *  liste, un score monté par un renfort n'avait aucune justification lisible. */
const SUPPORT_LABEL: Record<SupportReason, TranslationKey> = {
  'ean-echo': 'pwx.support.eanEcho',
  'ref-echo': 'pwx.support.refEcho',
  'title-echo': 'pwx.support.titleEcho',
  'visual-echo': 'pwx.support.visualEcho',
}

/** Au-delà, la description passe derrière un chevron : deux lignes suffisent à situer la
 *  pièce, un paragraphe entier repousserait le prix hors de vue à chaque ligne. */
const LONG_DESCRIPTION = 140

const STOCK_LABEL: Record<string, { key: TranslationKey; cls: string }> = {
  'in-stock': { key: 'pwx.inStock', cls: 'text-emerald-300' },
  'out-of-stock': { key: 'pwx.outOfStock', cls: 'text-rose-300' },
  'on-order': { key: 'pwx.onOrder', cls: 'text-amber-300' },
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

/**
 * Recherche externe d'une clé produit. Le seul recours quand le catalogue source ne suffit
 * pas à trancher : chez un grossiste, le libellé est souvent un code de gestion
 * (« SUB= 1 WAY ») et le visuel un logo générique, alors que la référence constructeur,
 * elle, est reconnue partout ailleurs sur le web.
 */
function SearchKey({ value, images = false, children }: {
  value: string; images?: boolean; children: ReactNode
}) {
  const { t } = useTranslation()
  const url = `https://www.google.com/search?${images ? 'tbm=isch&' : ''}q=${encodeURIComponent(value)}`
  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
      title={t(images ? 'pwx.search.images' : 'pwx.search.web', { value })}
      className="hover:text-indigo-300 hover:underline decoration-dotted underline-offset-[3px] transition-colors">
      {children}
    </a>
  )
}

/** Teinte de la preuve : la MÊME des deux côtés de la ligne, c'est ce qui fait lire le
 *  lien d'un coup d'œil. Verte pour un code-barres, bleue pour une référence — les
 *  couleurs que le badge de nature porte déjà. */
const PROOF_TONE = {
  ean: 'bg-emerald-400/20 text-emerald-200 rounded-[3px] px-0.5',
  ref: 'bg-sky-400/20 text-sky-200 rounded-[3px] px-0.5',
}

/** Texte dont on colore le ou les mots portant la clé de l'appariement. */
function Marked({ text, keyValue, isEan }: { text: string; keyValue: string; isEan: boolean }) {
  const segments = highlightKey(text, keyValue, isEan)
  if (!segments.some((s) => s.hit)) return <>{text}</>
  return (
    <>
      {segments.map((s, i) => (
        s.hit
          ? <mark key={i} className={isEan ? PROOF_TONE.ean : PROOF_TONE.ref}>{s.text}</mark>
          : <span key={i}>{s.text}</span>
      ))}
    </>
  )
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

export function ExplorerRow({ row, domain, onPickBand, verdict, onVerdict, onPickVerdict, visual }: {
  row: PairedRow
  /** Concurrent d'où vient la fiche. Fourni UNIQUEMENT en compilation, où chaque ligne
   *  vient d'un marchand différent — dans l'onglet d'un site, l'en-tête le porte déjà. */
  domain?: string
  /** Filtre la liste sur la bande cliquée. */
  onPickBand?: (band: ConfidenceBand) => void
  verdict?: Verdict | null
  onVerdict?: (v: Verdict) => void
  /** Filtre la liste sur le verdict cliqué (badge d'une ligne déjà jugée). */
  onPickVerdict?: (v: Verdict) => void
  /** Comparaison des photos, produite par le node « Comparer les visuels ». */
  visual?: StoredVisual | null
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  // Bascule AVANT/APRÈS, par ligne : on vérifie une traduction fiche par fiche, pas en
  // basculant tout l'écran — la comparaison utile est locale.
  const [showSource, setShowSource] = useState(false)
  const { listing, cmp, source, kind, confidence, proof } = row
  // Où la preuve se lit chez le concurrent, et laquelle de mes deux clés l'a portée.
  const spot = proof ? proofSpot(proof.evidence) : null
  const proofOn = proof ? (proof.isEan ? 'ean' : 'ref') : null
  const gap = cmp.deltaPct ?? null
  const promo = discountPct(listing)
  const stock = listing.availability ? STOCK_LABEL[listing.availability] : null
  // L'infobulle NOMME ce qui cloche : c'est là toute la valeur d'audit de l'indice. Sans
  // elle, « 43 » n'apprend rien et l'utilisateur doit rouvrir les deux fiches.
  //
  // ⚠ Elle nomme AUSSI la preuve, même quand rien ne cloche : sur une ligne « à vérifier »
  // sans motif de doute, la liste des doutes est vide et l'infobulle ne disait alors que le
  // score. C'est la nature de la preuve qui décidait de la bande, et elle restait muette.
  const proofLabel = proof ? EVIDENCE_LABEL[proof.evidence] : null
  const why = confidence
    ? [
        t('pwx.trust.score', { score: confidence.score }),
        ...(proofLabel ? [t('pwx.trust.proof', { what: t(proofLabel) })] : []),
        ...confidence.doubts.map((d) => `• ${t(DOUBT_LABEL[d])}`),
        ...confidence.supports.map((s) => `+ ${t(SUPPORT_LABEL[s])}`),
      ].join('\n')
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
                  {source.ref
                    ? <SearchKey value={source.ref}>
                        <span className={proofOn === 'ref' ? PROOF_TONE.ref : ''}>{source.ref}</span>
                      </SearchKey>
                    : '—'}
                </span>
                <span className="text-white/45">
                  <span className="text-white/30 mr-1">{t('pwx.badge.ean')}</span>
                  {source.ean
                    ? <SearchKey value={source.ean}>
                        <span className={proofOn === 'ean' ? PROOF_TONE.ean : ''}>{source.ean}</span>
                      </SearchKey>
                    : t('pwx.noEan')}
                </span>
                {/* Recherche d'images sur la référence : la vérification la plus rapide
                    quand le visuel du catalogue est un logo générique. */}
                {(source.ref || source.ean) && (
                  <SearchKey value={(source.ref || source.ean) as string} images>
                    <span className="text-white/25 hover:text-indigo-300 inline-flex items-center">
                      <ImageIcon className="w-3 h-3" />
                    </span>
                  </SearchKey>
                )}
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
                {visual && (
                  <span title={`${visual.note}\n\n${t('pwx.visual.score', { score: visual.score })}`}
                    className={`px-1 rounded border text-[9px] uppercase tracking-wide cursor-help ${VISUAL_BADGE[visual.verdict].cls}`}>
                    {t(VISUAL_BADGE[visual.verdict].key)}
                    {visual.verdict !== 'unclear' && <span className="ml-1 opacity-60 tabular-nums">{visual.score}</span>}
                  </span>
                )}
              </div>
              {/* Avant / après enrichissement. N'apparaît QUE si la feuille porte la
                  mémoire de l'original — un catalogue jamais enrichi n'a rien à montrer,
                  et un bouton inerte vaudrait moins que pas de bouton. */}
              {(source.nameSource || source.descriptionSource) && (
                <button type="button" onClick={() => setShowSource((v) => !v)}
                  className={`mt-1 inline-flex items-center gap-1 rounded px-1 py-px text-[9px] font-medium uppercase tracking-wide border transition-colors ${
                    showSource
                      ? 'text-amber-200 bg-amber-500/15 border-amber-500/35'
                      : 'text-white/40 border-white/15 hover:text-white/70 hover:border-white/30'
                  }`}
                  title={t('pwx.original.help')}>
                  <Languages className="w-2.5 h-2.5" />
                  {showSource ? t('pwx.original.showing') : t('pwx.original.show')}
                </button>
              )}
              {source.url ? (
                <a href={source.url} target="_blank" rel="noopener noreferrer" title={t('pw.table.openSource')}
                  className="block text-xs text-white/90 leading-snug mt-0.5 break-words underline decoration-dotted decoration-white/30 underline-offset-[3px] hover:text-indigo-300 hover:decoration-solid">
                  {showSource && source.nameSource ? source.nameSource : source.name}
                </a>
              ) : (
                <div className="text-xs text-white/90 leading-snug mt-0.5 break-words">
                  {showSource && source.nameSource ? source.nameSource : source.name}
                </div>
              )}
              {/* La description est LUE, pas dépliée : elle sert à trancher « est-ce bien
                  la même pièce ? » et l'obliger à un clic sur chaque ligne annulait
                  l'intérêt de la vue en regard. Le chevron ne subsiste que pour les
                  descriptions assez longues pour noyer la ligne. */}
              {(() => {
                const desc = showSource && source.descriptionSource
                  ? source.descriptionSource
                  : source.description
                if (!desc) return null
                const cls = showSource ? 'text-amber-200/60' : 'text-white/45'
                return desc.length <= LONG_DESCRIPTION ? (
                  <div className={`mt-1 text-[11px] leading-snug break-words ${cls}`}>{desc}</div>
                ) : (
                  <button type="button" onClick={() => setOpen((o) => !o)}
                    className={`mt-1 text-left text-[11px] hover:text-white/70 flex items-start gap-1 ${cls}`}>
                    <ChevronDown className={`w-3 h-3 mt-0.5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
                    <span className={open ? '' : 'line-clamp-2'}>{desc}</span>
                  </button>
                )
              })()}
              <div className="mt-1 text-[11px] tabular-nums text-white/70">
                {t('pwx.monPrixHt')} <span className="text-white/90 font-medium">{eur(source.priceHt)}</span>
              </div>
            </div>
            {/* Visuels F1, collés au séparateur central. */}
            <div className="flex gap-1 shrink-0">
              {source.images.length === 0
                ? <ExplorerThumb src={null} alt="" />
                : source.images.slice(0, 2).map((u) => <ExplorerThumb key={u} src={u} alt={source.name} />)}
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
        <ExplorerThumb src={listingImage(listing)} alt={listing.name} />
        <div className="min-w-0 flex-1">
          {/* En compilation, l'en-tête ne peut plus nommer le marchand : chaque ligne vient
              d'un site différent, et valider un appariement sans savoir chez QUI n'a
              aucun sens. Absent dans l'onglet d'un concurrent (cf. le commentaire plus bas). */}
          {domain && (
            <div className="text-[10px] font-medium text-indigo-300/70 truncate mb-0.5" title={domain}>{domain}</div>
          )}
          <a href={listing.url} target="_blank" rel="noopener noreferrer" title={listing.url}
            className="block text-xs text-white/90 leading-snug break-words underline decoration-dotted decoration-white/30 underline-offset-[3px] hover:text-indigo-300 hover:decoration-solid">
            {proof ? <Marked text={listing.name} keyValue={proof.keyValue} isEan={proof.isEan} /> : listing.name}
          </a>
          {/* Pas de nom de domaine ici hors compilation : l'onglet actif et l'en-tête de
              colonne le portent déjà. Répété sur chaque ligne, il masquait la référence. */}
          {(listing.ref || listing.gtin13) && (
            <div className="text-[10px] text-white/40 tabular-nums mt-0.5">
              {listing.ref && (
                <span className={spot === 'ref' ? PROOF_TONE.ref : ''}>
                  {proof ? <Marked text={listing.ref} keyValue={proof.keyValue} isEan={proof.isEan} /> : listing.ref}
                </span>
              )}
              {listing.ref && listing.gtin13 && ' · '}
              {listing.gtin13 && (
                <span className={spot === 'gtin' ? PROOF_TONE.ean : ''}>{listing.gtin13}</span>
              )}
            </div>
          )}
          {/* La preuve n'est visible NULLE PART sur la fiche : elle est dans l'adresse.
              Le dire évite de chercher un chiffre absent de tout ce qui est affiché. */}
          {spot === 'url' && proof && (
            <div className="text-[10px] mt-0.5">
              <span className={`${proof.isEan ? PROOF_TONE.ean : PROOF_TONE.ref} tabular-nums`}>{proof.keyValue}</span>
              <span className="text-white/30 ml-1">{t('pwx.proof.inUrl')}</span>
            </div>
          )}
          <div className="flex items-baseline gap-2 flex-wrap mt-1 tabular-nums">
            <span className="text-sm text-white/90 font-medium">{eur(cmp.priceHt)}</span>
            <span className="text-[10px] text-white/35">HT</span>
            {cmp.priceTtc != null && <span className="text-[10px] text-white/35">({eur(cmp.priceTtc)} TTC)</span>}
            {gap != null && <span className={`text-xs font-medium ${gapTone(gap)}`}>{pct(gap)}</span>}
          </div>
          {/* PRIX PROFESSIONNELS, quand le site est lu en accès connecté. Trois montants
              qu'il ne faut jamais fusionner avec le prix de vente : ce qu'on PAIE, ce que
              le fournisseur CONSEILLE, et la remise entre les deux. Absents d'une fiche
              grand public — la ligne ne s'affiche alors pas. */}
          {listing.netPrice != null && (
            <div className="mt-1 flex items-baseline gap-2 flex-wrap tabular-nums rounded bg-white/[0.04] px-1.5 py-1">
              <span className="text-[9px] uppercase tracking-wide text-white/35">{t('pwx.buyPrice')}</span>
              <span className="text-sm font-semibold text-emerald-300">{eur(listing.netPrice)}</span>
              <span className="text-[10px] text-white/35">HT</span>
              {listing.advisedPrice != null && (
                <span className="text-[10px] text-white/40">
                  {t('pwx.advisedPrice')} <span className="text-white/70">{eur(listing.advisedPrice)}</span>
                </span>
              )}
              {listing.discountPct != null && (
                <span className="text-[10px] font-medium text-amber-300">−{listing.discountPct} %</span>
              )}
            </div>
          )}
          {/* VENDEUR. Sur une marketplace, le nom de domaine ne dit plus qui vend : la même
              fiche est proposée par des marchands tiers à des prix différents, et un écart
              n'est pas interprétable tant qu'on ignore à qui on se compare. Absent chez un
              marchand qui vend son propre stock — donc rien n'est affiché dans ce cas. */}
          {listing.seller && (
            <div className="mt-0.5 text-[10px] text-white/45 truncate" title={listing.seller}>
              {t('pwx.soldBy', { seller: listing.seller })}
            </div>
          )}
          <div className="flex items-center gap-2 mt-0.5 text-[10px]">
            {stock && <span className={stock.cls}>{t(stock.key)}</span>}
            {promo != null && (
              <span className="text-amber-300">
                −{promo} % <span className="text-white/30 line-through">{eur(cmp.listPriceTtc)}</span>
              </span>
            )}
            {/* Prix absent VS prix refusé : deux situations, deux gestes. La première dit
                que le site n'affiche rien d'exploitable ; la seconde que NOUS avons écarté
                ce qu'il affiche, et alors le chiffre du refus doit être lisible — c'est lui
                qui permet de juger si c'est le seuil ou l'appariement qui est en cause. */}
            {cmp.priceHt == null && (cmp.rejected === 'drop-too-deep' && cmp.rejectedPct != null ? (
              <span className="text-amber-300/70 italic" title={t('pwx.prixEcarte.help')}>
                {t('pwx.prixEcarte', { pct: cmp.rejectedPct })}
              </span>
            ) : cmp.rejected === 'below-floor' ? (
              <span className="text-amber-300/70 italic" title={t('pwx.prixPlancher.help')}>
                {t('pwx.prixPlancher')}
              </span>
            ) : (
              <span className="text-white/30 italic">{t('pwx.prixNonExploitable')}</span>
            ))}
          </div>
        </div>
        {/* Jugement, au bout de la ligne : le geste vient APRÈS la comparaison visuelle. */}
        {source && onVerdict && <VerdictButtons verdict={verdict ?? null} onSet={onVerdict} />}
      </div>
    </div>
  )
}
