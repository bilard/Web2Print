// Aperçu chiffré d'un changement de règles, sur UN concurrent.
//
// ⚠ Un site à la fois, et l'écran le dit. Rejouer l'appariement demande l'index complet du
// concurrent (des dizaines de milliers de fiches) : les tenir tous en mémoire est
// exactement ce que le comparatif s'interdit depuis qu'un run de 435 756 fiches ne s'est
// plus jamais terminé. Un site suffit à trancher un réglage — les proportions se
// transposent, et le run complet donnera le chiffre exact.
import { useMemo, useState } from 'react'
import { previewPairing } from '../pairingPreview'
import type { SourceProduct } from '../catalog/match'
import type { CompetitorListing } from '../catalog/prestashop'
import type { PairingRules } from '../catalog/pairingRules'
import { useTranslation } from '@/lib/i18n'

const cardCls = 'bg-surface rounded-lg px-3 py-2.5'

/** Paires retenues en mémoire par l'aperçu. Un durcissement peut en produire des milliers
 *  (13 980 relevés sur un vrai suivi) ; on en garde assez pour parcourir sérieusement sans
 *  charger tout le catalogue dans le rendu. */
const CALC_CAP = 2000
/** Paires ajoutées à chaque « afficher plus ». */
const PAGE = 100

/** ⚠ Produits et fiches sont reçus en PROPS, jamais rechargés ici : l'atelier les lit
 *  déjà pour mesurer l'arbre, et deux hooks sur les mêmes documents doublaient la lecture
 *  d'un index de plusieurs dizaines de milliers de fiches. */
export function RulesPreview(
  { products, listings, current, proposed }:
  {
    products: SourceProduct[]
    listings: CompetitorListing[]
    current: PairingRules
    proposed: PairingRules
  },
) {
  const { t } = useTranslation()
  const [shown, setShown] = useState(PAGE)

  const preview = useMemo(
    () => (products.length === 0 || listings.length === 0
      ? null
      : previewPairing(products, listings, current, proposed, CALC_CAP)),
    [products, listings, current, proposed],
  )

  // Les listes non vides seulement : c'est leur NOMBRE qui décide de la mise en colonnes.
  const lists = useMemo(
    () => ([['lost', preview?.lost ?? [], preview?.lostTotal ?? 0],
      ['gained', preview?.gained ?? [], preview?.gainedTotal ?? 0]] as const)
      .filter(([, list]) => list.length > 0),
    [preview],
  )

  if (!preview) return <p className="text-xs text-white/40">{t('pw.rules.preview.pickSite')}</p>

  const delta = preview.after - preview.before
  const unchanged = preview.lostTotal === 0 && preview.gainedTotal === 0

  return (
    <div className="space-y-2">
      {/* ⚠ « Perdus » se lisait comme une perte SUBIE. Ces quatre nombres décrivent une
          SIMULATION : rien n'est appliqué avant l'enregistrement, et le libellé le dit
          maintenant lui-même — une infobulle ne suffit pas pour lever un contresens. */}
      <div className="grid gap-2 grid-cols-2 sm:grid-cols-4">
        {([
          ['before', preview.before, t('pw.rules.preview.before'), null, 'text-white'],
          ['after', preview.after, t('pw.rules.preview.after'), null,
            delta < 0 ? 'text-amber-400' : delta > 0 ? 'text-emerald-400' : 'text-white'],
          ['lost', preview.lostTotal, t('pw.rules.preview.lost'), t('pw.rules.preview.lostHelp'), 'text-white'],
          ['gained', preview.gainedTotal, t('pw.rules.preview.gained'), t('pw.rules.preview.gainedHelp'), 'text-white'],
        ] as const).map(([key, value, label, help, tone]) => (
          <div key={key} className="bg-surface rounded-lg px-3 py-2" title={help ?? undefined}>
            <div className="text-[11px] text-white/40 leading-tight">{label}</div>
            <div className={`text-lg tabular-nums leading-tight ${tone}`}>
              {value}
              {key === 'after' && delta !== 0 && (
                <span className="text-[11px] ml-1">({delta > 0 ? '+' : ''}{delta})</span>
              )}
            </div>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-white/30">{t('pw.rules.preview.sim')}</p>

      {unchanged && <p className="text-[11px] text-white/40">{t('pw.rules.preview.unchanged')}</p>}

      {/* Par NATURE DE PREUVE : c'est ce qui dit OÙ le réglage a mordu, et donc s'il a
          fait ce qu'on croyait lui demander. */}
      {preview.byEvidence.length > 0 && (
        <div className="bg-surface rounded-lg px-3 py-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-white/40 mb-1">
            {t('pw.rules.preview.byEvidence')}
          </div>
          <div>
            {preview.byEvidence.map((row) => (
              <div key={row.evidence} className="flex items-baseline justify-between gap-4 text-[13px] py-0.5">
                <span className="text-white/70">{t(`pw.rules.evidence.${row.evidence}` as 'pw.rules.evidence.gtin13')}</span>
                <span className="tabular-nums text-white/50">
                  {row.before}
                  {row.after !== row.before && <span className="text-white ml-2">→ {row.after}</span>}
                </span>
              </div>
            ))}
          </div>
          <div className="text-[11px] text-white/40 mt-1">
            {t('pw.rules.preview.vetoed', { before: preview.vetoed.before, after: preview.vetoed.after })}
          </div>
        </div>
      )}

      {/* Les paires elles-mêmes : un chiffre ne se juge qu'en regardant ce qu'il recouvre.
          ⚠ La grille s'ADAPTE au nombre de listes non vides. En deux colonnes fixes, une
          liste seule (le cas d'un simple durcissement : rien de gagné) n'occupait que la
          moitié de la largeur, l'autre moitié restant vide — et les libellés, tronqués
          dans cette demi-largeur, ne disaient plus quel article était perdu. */}
      {lists.length > 0 && (
        <div className={`grid gap-3 ${lists.length > 1 ? 'lg:grid-cols-2' : 'grid-cols-1'}`}>
          {lists.map(([kind, list, total]) => (
            <div key={kind} className={cardCls}>
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-white/40">
                  {kind === 'lost' ? t('pw.rules.preview.lostList') : t('pw.rules.preview.gainedList')}
                </span>
                <span className="text-xs text-white/30 tabular-nums">
                  {shown < total
                    ? t('pw.rules.preview.capped', { shown: Math.min(shown, list.length), total })
                    : t('pw.rules.preview.allShown', { total })}
                </span>
              </div>
              {/* Une ligne = une paire, sur UNE rangée en pleine largeur : le produit, la
                  fiche qui le portait, la preuve. Aucun `truncate` — un libellé coupé à
                  « Lame 52 CM AXXOM - 505… » ne permet pas de juger l'appariement, ce qui
                  est la seule raison d'afficher cette liste. */}
              <div className="max-h-[26rem] overflow-y-auto divide-y divide-white/5">
                {list.slice(0, shown).map((c) => (
                  <div
                    key={`${c.productId}-${c.listingUrl}`}
                    className="text-xs py-1.5 flex flex-col gap-x-4 gap-y-0.5 sm:flex-row sm:items-baseline"
                  >
                    <span className="text-white/85 break-words sm:w-52 sm:shrink-0">{c.productName}</span>
                    <a
                      href={c.listingUrl} target="_blank" rel="noreferrer"
                      className="text-white/55 hover:text-white break-words flex-1 min-w-0"
                    >
                      {c.listingName || c.listingUrl}
                    </a>
                    <span className="text-white/30 break-words sm:text-right sm:w-56 sm:shrink-0">
                      {t(`pw.rules.evidence.${c.evidence}` as 'pw.rules.evidence.gtin13')} · {c.keyRaw}
                    </span>
                  </div>
                ))}
              </div>
              {shown < Math.min(list.length, total) && (
                <button
                  type="button" onClick={() => setShown((n) => n + PAGE)}
                  className="mt-2 text-xs rounded px-3 py-1.5 border border-white/10 text-white/60 hover:text-white hover:border-white/25"
                >
                  {t('pw.rules.preview.showMore', { n: PAGE })}
                </button>
              )}
              {/* Le plafond de CALCUL, distinct de celui d'affichage : au-delà, les paires
                  ne sont pas gardées en mémoire. Le dire évite de chercher un bouton
                  « suivant » qui ne viendra pas. */}
              {list.length >= CALC_CAP && total > list.length && (
                <p className="mt-2 text-xs text-white/30">{t('pw.rules.preview.calcCap', { n: CALC_CAP })}</p>
              )}
            </div>
          ))}
        </div>
      )}

    </div>
  )
}
