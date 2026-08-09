// Une fiche dans l'écran « Traduire et améliorer les textes » : ce qu'elle DIT avant, ce
// qu'elle dit après.
//
// ⚠ Le texte de vente n'est pas tronqué ici, contrairement à toutes les autres listes de
// l'explorateur. C'est le champ que l'écran réécrit : juger une reformulation sur trois
// lignes coupées par « … », c'est juger sur ce qu'on ne voit pas — et le passage qui
// dénature une fiche est précisément celui qui tombe hors du cadre.
//
// Extraite de `TextEnrichScreen`, qui portait déjà toute la mécanique du run.
import { RotateCcw } from 'lucide-react'
import { useTranslation, intlLocale } from '@/lib/i18n'
import { ExplorerThumb } from '../explorer/ExplorerThumb'
import { absoluteImage } from '../explorer/pairing'
import type { RejectionPart } from './violationSummary'
import type { SourceProduct } from '../catalog/match'
import type { TextRevision } from '../textRevisionsStore'
import { opsOf } from './revisionOps'

export function TextEnrichRow({ product, lang, revision, rejection, imagePrefix, onRevert }: {
  product: SourceProduct
  /** Langue détectée sur le texte de vente, `null` quand le détecteur s'abstient. */
  lang: string | null
  revision?: TextRevision
  /** Motifs du refus quand la réécriture a été rejetée par la garde. */
  rejection?: RejectionPart[]
  imagePrefix?: string
  onRevert: () => void
}) {
  const { t, locale } = useTranslation()
  const p = product
  // ⚠ Ce que la CARTE de workflow a réécrit, colonne par colonne. Elle travaille sur une
  // feuille et ne sait pas laquelle de ses colonnes deviendra le nom du produit : on
  // affiche donc la colonne telle qu'elle s'appelle dans le fichier (« TEXT_VENTE »,
  // « DESIGNATION »), ce qui se lit très bien et n'invente rien.
  const cols = Object.entries(revision?.byColumn ?? {})
  // ⚠ Déduit quand la révision est antérieure au champ `ops` : elle affichait « Traité »
  // alors que sa note dit « Traduction de l'anglais vers le français ».
  const ops = opsOf(revision, lang)
  // ⚠ Le NOM D'ORIGINE, quand la feuille l'a gardé dans sa colonne « (source) ». Sans ce
  // repli, la colonne AVANT affiche le libellé déjà traduit dès que « Comparer catalogue »
  // est repassé derrière la carte — c'est-à-dire l'après, à gauche comme à droite.
  const name = p.nameSource ?? p.name
  const img = (p.image ? absoluteImage(p.image, imagePrefix) : '') || null

  return (
    <div className="px-4 py-2.5 border-b border-white/[0.05] flex gap-3">
      {/* Le visuel tranche des cas que le texte seul laisse ouverts : un libellé
          néerlandais sur une photo de courroie dit tout de suite de quoi on parle. */}
      <ExplorerThumb src={img} alt={p.name} size="w-14 h-14" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 text-[10px] text-white/35">
          {p.ref && (
            <span className="tabular-nums">
              <span className="uppercase tracking-wide text-white/25">{t('pw.audit.ref')} </span>
              <span className="text-white/55">{p.ref}</span>
            </span>
          )}
          {lang && <span className="rounded border border-white/15 px-1 uppercase">{lang}</span>}
          {/* Ce qui a été FAIT sur cette fiche. Sans ces marques, la colonne APRÈS montrait
              une traduction et une réécriture de la même façon — or on ne les relit pas
              pareil : une traduction se vérifie, une réécriture se juge. */}
          {revision && (ops.translate || ops.improve ? (
            <>
              {ops.translate && (
                <span className="rounded border border-sky-400/30 bg-sky-500/10 px-1 text-sky-200/80">
                  {t('pwte.badge.translated')}
                </span>
              )}
              {ops.improve && (
                <span className="rounded border border-violet-400/30 bg-violet-500/10 px-1 text-violet-200/80">
                  {t('pwte.badge.improved')}
                </span>
              )}
            </>
          ) : (
            // Ni l'une ni l'autre : révision antérieure au champ `ops`, sur une fiche dont
            // la langue d'origine n'a pas été tranchée. On dit « traité », sans plus.
            <span className="rounded border border-white/15 px-1 text-white/40">{t('pwte.badge.done')}</span>
          ))}
          {/* Le prix situe l'enjeu : on ne relit pas de la même façon l'argumentaire d'une
              pièce à 4 € et celui d'une machine à 900 €. */}
          {typeof p.price === 'number' && (
            <span className="tabular-nums text-white/60">
              {p.price.toLocaleString(intlLocale(locale), { style: 'currency', currency: 'EUR' })}
            </span>
          )}
          {/* QUAND la fiche a été traitée : sans date, on ne sait pas si l'« après » date
              de ce matin ou d'un passage d'il y a trois semaines — donc s'il tient compte
              du texte source actuel. */}
          {revision?.at != null && (
            <span className="tabular-nums text-white/30" title={new Date(revision.at).toLocaleString(intlLocale(locale))}>
              {new Date(revision.at).toLocaleDateString(intlLocale(locale), { day: '2-digit', month: 'short', year: '2-digit' })}
            </span>
          )}
          {revision && (
            <button type="button" onClick={onRevert}
              className="ml-auto flex items-center gap-1 text-white/35 hover:text-rose-300">
              <RotateCcw className="w-3 h-3" />{t('pwte.revert')}
            </button>
          )}
        </div>

        {/* Avant à gauche, après à droite : c'est la comparaison qu'on vient faire,
            elle ne doit demander aucun clic. */}
        <div className="mt-1 grid gap-3 sm:grid-cols-2">
          <div className="min-w-0">
            <p className="text-[9px] uppercase tracking-wide text-white/25">{t('pwte.before')}</p>
            {/* Les deux champs sont NOMMÉS : sans étiquette, deux lignes de texte se
                lisent comme un titre et son sous-titre, alors que la seconde est le
                texte de vente — le champ que l'écran est censé traiter. */}
            <p className="text-[9px] uppercase tracking-wide text-white/20">{t('pwte.field.name')}</p>
            {/* La fiche s'ouvre depuis le NOM lui-même. Un picto « Voir la fiche » de plus
                dans l'en-tête doublait ce que le libellé désigne déjà, et c'est sur le
                libellé qu'on clique quand on veut vérifier de quel article on parle. */}
            {p.url ? (
              <a href={p.url} target="_blank" rel="noreferrer" title={t('pwte.openProduct')}
                className="text-[12px] text-white/70 break-words hover:text-indigo-300 hover:underline decoration-dotted underline-offset-2">
                {name}
              </a>
            ) : (
              <p className="text-[12px] text-white/70 break-words">{name}</p>
            )}
            {/* ⚠ Le texte de vente du CATALOGUE n'est l'« avant » que si personne ne l'a
                déjà réécrit. Dès que la carte de workflow est passée, « Comparer
                catalogue » a recopié le texte ENRICHI dans le catalogue : l'afficher ici
                mettrait l'après des deux côtés. Les blocs par colonne, eux, portent
                l'original — ils remplacent alors ce bloc au lieu de s'y ajouter. */}
            {cols.length === 0 ? (
              <>
                <p className="mt-1 text-[9px] uppercase tracking-wide text-white/20">{t('pwte.field.saleText')}</p>
                {p.description
                  ? <p className="text-[11px] text-white/35 break-words whitespace-pre-line">{p.description}</p>
                  : <p className="text-[11px] italic text-white/20">{t('pwte.field.empty')}</p>}
              </>
            ) : cols.map(([key, v]) => (
              <div key={key} className="mt-1">
                <p className="text-[9px] uppercase tracking-wide text-white/20">{key}</p>
                <p className="text-[11px] text-white/35 break-words whitespace-pre-line">{v.before}</p>
              </div>
            ))}
          </div>
          <div className="min-w-0">
            <p className="text-[9px] uppercase tracking-wide text-emerald-300/40">{t('pwte.after')}</p>
            {revision ? (
              <>
                {/* Réécriture faite DEPUIS CET ÉCRAN : elle range son résultat dans le nom
                    et le texte de vente, parce qu'ici on sait lequel est lequel. */}
                {revision.name != null && (
                  <>
                    <p className="text-[9px] uppercase tracking-wide text-white/20">{t('pwte.field.name')}</p>
                    <p className="text-[12px] text-emerald-100/90 break-words">{revision.name}</p>
                    <p className="mt-1 text-[9px] uppercase tracking-wide text-white/20">{t('pwte.field.saleText')}</p>
                    {revision.description
                      ? <p className="text-[11px] text-emerald-200/50 break-words whitespace-pre-line">{revision.description}</p>
                      : <p className="text-[11px] italic text-white/20">{t('pwte.field.empty')}</p>}
                  </>
                )}
                {cols.map(([key, v]) => (
                  <div key={key} className="mt-1">
                    <p className="text-[9px] uppercase tracking-wide text-white/20">{key}</p>
                    <p className="text-[11px] text-emerald-200/60 break-words whitespace-pre-line">{v.after}</p>
                    {v.note && <p className="text-[10px] italic text-white/30 break-words">{v.note}</p>}
                  </div>
                ))}
                {revision.note && (
                  <p className="mt-0.5 text-[10px] italic text-white/30 break-words">{revision.note}</p>
                )}
              </>
            ) : rejection?.length ? (
              <div className="space-y-0.5">
                <p className="text-[11px] text-amber-300/80">{t('pwte.rejected')}</p>
                {rejection.map((r, i) => (
                  <p key={i} className="text-[10px] text-amber-200/50 break-words">
                    {t(r.key, { token: r.token })}
                  </p>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-white/20">{t('pwte.pending')}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
