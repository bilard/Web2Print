// Une fiche dans l'écran « Traduire et améliorer les textes » : ce qu'elle DIT avant, ce
// qu'elle dit après.
//
// ⚠ Aucun texte n'est tronqué ici, contrairement à toutes les autres listes de
// l'explorateur. C'est le champ que l'écran réécrit : juger une reformulation sur trois
// lignes coupées par « … », c'est juger sur ce qu'on ne voit pas — et le passage qui
// dénature une fiche est précisément celui qui tombe hors du cadre. Quand le CATALOGUE, lui,
// a enregistré un texte amputé, on va chercher la cellule entière de la feuille
// (`fullSaleText`) plutôt que d'afficher le moignon.
//
// ⚠ Chaque bloc porte sa PROVENANCE : sans elle, quatre textes se suivaient dans la colonne
// APRÈS sans qu'on sache lequel venait du catalogue F1, lequel d'une traduction et lequel
// d'une réécriture.
import { useTranslation } from '@/lib/i18n'
import { ExplorerThumb } from '../explorer/ExplorerThumb'
import { absoluteImage } from '../explorer/pairing'
import { TextEnrichBlock, type Provenance } from './TextEnrichBlock'
import { TextEnrichRowMeta } from './TextEnrichRowMeta'
import { originForDisplay, madeOnTruncatedSource, isTruncated } from './fullSaleText'
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
  const { t } = useTranslation()
  const p = product
  // ⚠ Ce que la CARTE de workflow a réécrit, colonne par colonne. Elle travaille sur une
  // feuille et ne sait pas laquelle de ses colonnes deviendra le nom du produit : on
  // affiche donc la colonne telle qu'elle s'appelle dans le fichier (« TEXT_VENTE »,
  // « DESIGNATION »), ce qui se lit très bien et n'invente rien.
  const cols = Object.entries(revision?.byColumn ?? {})
  // ⚠ Déduit quand la révision est antérieure au champ `ops` : elle affichait « Traité »
  // alors que sa note dit « Traduction de l'anglais vers le français ».
  const ops = opsOf(revision, lang)
  // Ce qu'on écrit sur les blocs de DROITE. « Traité » seul quand ni l'une ni l'autre n'est
  // connue : une révision antérieure au champ `ops`, sur une fiche dont la langue d'origine
  // n'a pas été tranchée — la ranger d'office en « traduit » serait une invention.
  const after: Provenance[] = ops.translate || ops.improve
    ? [...(ops.translate ? ['translated' as const] : []), ...(ops.improve ? ['improved' as const] : [])]
    : ['done']
  // ⚠ Le NOM D'ORIGINE, quand la feuille l'a gardé dans sa colonne « (source) ». Sans ce
  // repli, la colonne AVANT affiche le libellé déjà traduit dès que « Comparer catalogue »
  // est repassé derrière la carte — c'est-à-dire l'après, à gauche comme à droite.
  const name = p.nameSource ?? p.name
  const origin = originForDisplay(p, revision)
  // Une réécriture faite sur un moignon ne se répare pas à l'affichage : elle se refait. La
  // file la reprend d'elle-même, on le DIT ici pour que la coupe visible s'explique.
  const redo = madeOnTruncatedSource(p, revision)
  const img = (p.image ? absoluteImage(p.image, imagePrefix) : '') || null

  return (
    <div className="px-4 py-2.5 border-b border-white/[0.05] flex gap-3">
      {/* Le visuel tranche des cas que le texte seul laisse ouverts : un libellé
          néerlandais sur une photo de courroie dit tout de suite de quoi on parle. */}
      <ExplorerThumb src={img} alt={p.name} size="w-14 h-14" />
      <div className="min-w-0 flex-1">
        <TextEnrichRowMeta product={p} lang={lang} revision={revision} onRevert={onRevert} />

        {/* Avant à gauche, après à droite : c'est la comparaison qu'on vient faire,
            elle ne doit demander aucun clic. */}
        <div className="mt-1 grid gap-3 sm:grid-cols-2">
          <div className="min-w-0">
            <p className="text-[9px] uppercase tracking-wide text-white/25">{t('pwte.before')}</p>
            {/* La fiche s'ouvre depuis le NOM lui-même : c'est sur le libellé qu'on clique
                quand on veut vérifier de quel article on parle. */}
            <TextEnrichBlock label={t('pwte.field.name')} from={['source']} tone="before" strong text={name}>
              {p.url ? (
                <a href={p.url} target="_blank" rel="noreferrer" title={t('pwte.openProduct')}
                  className="text-[12px] text-white/70 break-words hover:text-indigo-300 hover:underline decoration-dotted underline-offset-2">
                  {name}
                </a>
              ) : undefined}
            </TextEnrichBlock>
            {/* ⚠ Le texte de vente du CATALOGUE n'est l'« avant » que si personne ne l'a
                déjà réécrit. Dès que la carte de workflow est passée, « Comparer
                catalogue » a recopié le texte ENRICHI dans le catalogue : l'afficher ici
                mettrait l'après des deux côtés. Les blocs par colonne, eux, portent
                l'original — ils remplacent alors ce bloc au lieu de s'y ajouter. */}
            {cols.length === 0 ? (
              <TextEnrichBlock label={t('pwte.field.saleText')} from={['source']} tone="before"
                text={origin.text} {...(origin.truncated ? { warn: t('pwte.origin.cut') } : {})} />
            ) : cols.map(([key, v]) => (
              <TextEnrichBlock key={key} label={key} from={['source']} tone="before" text={v.before} />
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
                    <TextEnrichBlock label={t('pwte.field.name')} from={after} tone="after" strong
                      text={revision.name} />
                    <TextEnrichBlock label={t('pwte.field.saleText')} from={after} tone="after"
                      text={revision.description}
                      {...(isTruncated(revision.description)
                        ? { warn: t(redo ? 'pwte.origin.redo' : 'pwte.origin.cut') } : {})} />
                  </>
                )}
                {cols.map(([key, v]) => (
                  <TextEnrichBlock key={key} label={key} from={after} tone="after" text={v.after}
                    {...(v.note ? { note: v.note } : {})} />
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
