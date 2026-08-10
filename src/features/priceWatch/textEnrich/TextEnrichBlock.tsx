// Un champ de la comparaison avant/après, AVEC SA PROVENANCE.
//
// ⚠ L'étiquette de provenance n'est pas une décoration. Quatre textes se suivaient dans la
// colonne APRÈS — « Nom », « Texte de vente », puis les colonnes de la feuille — sans que
// rien ne dise lequel venait du catalogue F1, lequel d'une traduction et lequel d'une
// réécriture. On relisait donc de la traduction et de l'invention de la même façon, alors
// qu'une traduction se vérifie et qu'une réécriture se juge.
import type { ReactNode } from 'react'
import { useTranslation, type TranslationKey } from '@/lib/i18n'

/** D'où vient le texte affiché. `done` = révision antérieure au champ `ops` : on sait
 *  qu'elle a été traitée, pas comment — l'affirmer serait une invention. */
export type Provenance = 'source' | 'translated' | 'improved' | 'done'

const CHIP: Record<Provenance, string> = {
  source: 'border-white/15 text-white/40',
  translated: 'border-sky-400/30 bg-sky-500/10 text-sky-200/80',
  improved: 'border-violet-400/30 bg-violet-500/10 text-violet-200/80',
  done: 'border-white/15 text-white/40',
}

const LABEL: Record<Provenance, TranslationKey> = {
  source: 'pwte.origin.source',
  translated: 'pwte.badge.translated',
  improved: 'pwte.badge.improved',
  done: 'pwte.badge.done',
}

export function TextEnrichBlock({ label, from, text, tone, strong, warn, note, children }: {
  /** Nom du champ, tel qu'il s'appelle dans le fichier quand il vient d'une colonne. */
  label: string
  from: Provenance[]
  text?: string
  tone: 'before' | 'after'
  /** Le libellé produit : lu comme un titre, il ne se met pas en gris de corps de texte. */
  strong?: boolean
  /** Avertissement sur CE champ, déjà traduit : texte resté coupé, réécriture à refaire. */
  warn?: string
  /** Ce que le modèle dit avoir changé. */
  note?: string
  /** Rendu du texte à la place du paragraphe (le nom s'ouvre sur la fiche). */
  children?: ReactNode
}) {
  const { t } = useTranslation()
  const body = strong
    ? tone === 'after' ? 'text-[12px] text-emerald-100/90' : 'text-[12px] text-white/70'
    : tone === 'after' ? 'text-[11px] text-emerald-200/60' : 'text-[11px] text-white/35'

  return (
    <div className="mt-1">
      <p className="flex flex-wrap items-center gap-1 text-[9px] uppercase tracking-wide text-white/20">
        {label}
        {from.map((o) => (
          <span key={o} className={`rounded border px-1 text-[9px] normal-case tracking-normal ${CHIP[o]}`}>
            {t(LABEL[o])}
          </span>
        ))}
      </p>
      {/* ⚠ Jamais de troncature ici, ni `line-clamp` ni « … » : c'est le texte qu'on vient
          juger, et le passage qui dénature une fiche est précisément celui qui tomberait
          hors du cadre. */}
      {children ?? (text
        ? <p className={`${body} break-words whitespace-pre-line`}>{text}</p>
        : <p className="text-[11px] italic text-white/20">{t('pwte.field.empty')}</p>)}
      {warn && <p className="text-[10px] text-amber-300/70 break-words">{warn}</p>}
      {note && <p className="text-[10px] italic text-white/30 break-words">{note}</p>}
    </div>
  )
}
