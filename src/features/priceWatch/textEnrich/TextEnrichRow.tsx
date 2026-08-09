// Une fiche dans l'écran « Traduire et améliorer les textes » : ce qu'elle DIT avant, ce
// qu'elle dit après.
//
// ⚠ Le texte de vente n'est pas tronqué ici, contrairement à toutes les autres listes de
// l'explorateur. C'est le champ que l'écran réécrit : juger une reformulation sur trois
// lignes coupées par « … », c'est juger sur ce qu'on ne voit pas — et le passage qui
// dénature une fiche est précisément celui qui tombe hors du cadre.
//
// Extraite de `TextEnrichScreen`, qui portait déjà toute la mécanique du run.
import { RotateCcw, ExternalLink } from 'lucide-react'
import { useTranslation, intlLocale } from '@/lib/i18n'
import { ExplorerThumb } from '../explorer/ExplorerThumb'
import { absoluteImage } from '../explorer/pairing'
import type { RejectionPart } from './violationSummary'
import type { SourceProduct } from '../catalog/match'
import type { TextRevision } from '../textRevisionsStore'

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
          {p.url && (
            <a href={p.url} target="_blank" rel="noreferrer"
              className="flex items-center gap-1 text-white/35 hover:text-indigo-300"
              title={t('pwte.openProduct')}>
              <ExternalLink className="w-3 h-3" />{t('pwte.openProduct')}
            </a>
          )}
          {/* Le prix situe l'enjeu : on ne relit pas de la même façon l'argumentaire d'une
              pièce à 4 € et celui d'une machine à 900 €. */}
          {typeof p.price === 'number' && (
            <span className="tabular-nums text-white/60">
              {p.price.toLocaleString(intlLocale(locale), { style: 'currency', currency: 'EUR' })}
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
            <p className="text-[12px] text-white/70 break-words">{p.name}</p>
            <p className="mt-1 text-[9px] uppercase tracking-wide text-white/20">{t('pwte.field.saleText')}</p>
            {p.description
              ? <p className="text-[11px] text-white/35 break-words whitespace-pre-line">{p.description}</p>
              : <p className="text-[11px] italic text-white/20">{t('pwte.field.empty')}</p>}
          </div>
          <div className="min-w-0">
            <p className="text-[9px] uppercase tracking-wide text-emerald-300/40">{t('pwte.after')}</p>
            {revision ? (
              <>
                <p className="text-[9px] uppercase tracking-wide text-white/20">{t('pwte.field.name')}</p>
                <p className="text-[12px] text-emerald-100/90 break-words">{revision.name}</p>
                <p className="mt-1 text-[9px] uppercase tracking-wide text-white/20">{t('pwte.field.saleText')}</p>
                {revision.description
                  ? <p className="text-[11px] text-emerald-200/50 break-words whitespace-pre-line">{revision.description}</p>
                  : <p className="text-[11px] italic text-white/20">{t('pwte.field.empty')}</p>}
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
