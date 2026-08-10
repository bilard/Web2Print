// L'en-tête d'une fiche dans « Traduire et améliorer les textes » : ce qui situe l'article,
// pas ce qu'on relit. Séparé des textes parce qu'il ne répond pas à la même question — ici
// « de quel article parle-t-on et quand a-t-il été traité », en dessous « que dit-il ».
import { RotateCcw } from 'lucide-react'
import { useTranslation, intlLocale } from '@/lib/i18n'
import type { SourceProduct } from '../catalog/match'
import type { TextRevision } from '../textRevisionsStore'

export function TextEnrichRowMeta({ product, lang, revision, onRevert }: {
  product: SourceProduct
  /** Langue détectée sur le texte de vente, `null` quand le détecteur s'abstient. */
  lang: string | null
  revision?: TextRevision
  onRevert: () => void
}) {
  const { t, locale } = useTranslation()
  const p = product

  return (
    <div className="flex items-baseline gap-2 text-[10px] text-white/35">
      {p.ref && (
        <span className="tabular-nums">
          <span className="uppercase tracking-wide text-white/25">{t('pw.audit.ref')} </span>
          <span className="text-white/55">{p.ref}</span>
        </span>
      )}
      {lang && <span className="rounded border border-white/15 px-1 uppercase">{lang}</span>}
      {/* Le prix situe l'enjeu : on ne relit pas de la même façon l'argumentaire d'une pièce
          à 4 € et celui d'une machine à 900 €. */}
      {typeof p.price === 'number' && (
        <span className="tabular-nums text-white/60">
          {p.price.toLocaleString(intlLocale(locale), { style: 'currency', currency: 'EUR' })}
        </span>
      )}
      {/* QUAND la fiche a été traitée : sans date, on ne sait pas si l'« après » date de ce
          matin ou d'un passage d'il y a trois semaines — donc s'il tient compte du texte
          source actuel. */}
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
  )
}
