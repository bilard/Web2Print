// Le fil d'Ariane du forage : où l'on est descendu, et comment remonter.
//
// ⚠ Sans lui, forer serait un piège : l'axe change, les chiffres se réduisent, et rien ne
// dit ni d'où l'on vient ni comment revenir. Chaque niveau franchi est donc nommé avec la
// VALEUR qui l'a filtré — « Univers : Cuisine » —, et cliquable pour y remonter.
import { ChevronRight, Undo2 } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'
import type { DrillStep } from '../filters/drill'

export function DrillCrumbs({ steps, labelOf, onUp }: {
  steps: readonly DrillStep[]
  /** Nom lisible d'un champ — jamais son identifiant technique. */
  labelOf: (field: string) => string
  /** Remonter au niveau d'index donné (0 = tout en haut). */
  onUp: (index: number) => void
}) {
  const { t } = useTranslation()
  if (steps.length === 0) return null

  return (
    <span className="inline-flex items-center gap-1 text-[11px]">
      <button
        onClick={() => onUp(0)}
        title={t('bi.drill.upAll')}
        className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-white/45 hover:text-white hover:bg-white/[0.06] transition-colors"
      >
        <Undo2 className="w-3 h-3" />
        {t('bi.drill.all')}
      </button>
      {steps.map((s, i) => (
        <span key={`${s.field}:${i}`} className="inline-flex items-center gap-1">
          <ChevronRight className="w-3 h-3 text-white/20 shrink-0" />
          <button
            onClick={() => onUp(i + 1)}
            title={t('bi.drill.upTo', { level: labelOf(s.field) })}
            className="rounded px-1.5 py-0.5 text-indigo-300/90 hover:text-indigo-200 hover:bg-indigo-500/10 transition-colors"
          >
            {/* La valeur, pas seulement le niveau : « Famille » ne dit pas laquelle. */}
            {labelOf(s.field)} : {s.value ?? t('bi.filters.emptyValue')}
          </button>
        </span>
      ))}
    </span>
  )
}
