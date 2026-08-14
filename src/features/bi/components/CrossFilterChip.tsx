// La puce d'un filtre posé au CLIC dans une tuile.
//
// ⚠⚠ Sa raison d'être : un filtre invisible fait mentir tous les chiffres qu'il réduit.
// « 22 143 fiches » ne veut pas dire la même chose selon qu'on regarde les vingt-quatre
// concurrents ou le seul qu'on vient de cliquer. La puce se lit donc au-dessus du canevas,
// sans survol, et se retire d'un clic.
import { X } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'

export function CrossFilterChip({ label, onClear }: {
  /** Texte déjà composé (champ et valeur), via `describeFilter`. */
  label: string
  onClear: () => void
}) {
  const { t } = useTranslation()
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40
      bg-amber-500/10 pl-2.5 pr-1 py-0.5 text-[11px] text-amber-200">
      {label}
      <button
        onClick={onClear}
        title={t('bi.filters.remove')}
        className="rounded-full p-0.5 text-amber-200/70 hover:text-amber-100 hover:bg-amber-500/20 transition-colors"
      >
        <X className="w-3 h-3" />
      </button>
    </span>
  )
}
