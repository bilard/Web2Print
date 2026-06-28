import { useEffect, useState } from 'react'
import { Sparkles } from 'lucide-react'
import type { FormulaConversion } from './excelFormulas'
import { FormulaMorphCard } from './FormulaMorphCard'

/** Durée d'affichage de chaque métamorphose (ms) — assez pour voir le résultat apparaître. */
const DISPLAY_MS = 2200

interface Props {
  conversions: FormulaConversion[]
  fileName: string
  /** Appelé à la fin de la séquence ou sur « Passer » → enchaîne vers la Configuration. */
  onDone: () => void
}

/**
 * Joue la métamorphose des formules Excel détectées en champs calculés IBS Studio,
 * une à une, puis enchaîne automatiquement vers l'écran Configuration.
 */
export function FormulaTransformOverlay({ conversions, fileName, onDone }: Props) {
  const [index, setIndex] = useState(0)
  const total = conversions.length

  useEffect(() => {
    // Au-delà de la dernière → on a fini : on enchaîne.
    if (index >= total) {
      const t = setTimeout(onDone, 350)
      return () => clearTimeout(t)
    }
    const t = setTimeout(() => setIndex((i) => i + 1), DISPLAY_MS)
    return () => clearTimeout(t)
  }, [index, total, onDone])

  const current = conversions[Math.min(index, total - 1)]
  const done = index >= total

  return (
    <div className="w-full h-full flex flex-col items-center justify-center px-6 py-4 gap-4">
      {/* Bandeau */}
      <div className="flex items-center gap-2 text-indigo-300">
        <Sparkles className="w-4 h-4" />
        <span className="text-sm font-medium">
          {done
            ? `${total} formule${total > 1 ? 's' : ''} convertie${total > 1 ? 's' : ''}`
            : 'Conversion des formules Excel'}
        </span>
      </div>
      <p className="text-[11px] text-white/30 -mt-2">
        {fileName} · champ calculé natif, recalculé en direct
      </p>

      {/* Carte active (remontée à chaque index → rejoue l'animation CSS) */}
      <div className="flex-1 w-full flex items-center justify-center min-h-0">
        {current && <FormulaMorphCard key={index} conv={current} />}
      </div>

      {/* Progression + Passer */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="flex items-center gap-1.5">
          {conversions.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === Math.min(index, total - 1) ? 'w-5 bg-indigo-400' : 'w-1.5 bg-white/15'
              }`}
            />
          ))}
        </div>
        <button
          onClick={onDone}
          className="text-[11px] text-white/40 hover:text-white/70 px-2.5 py-1 rounded-md hover:bg-white/5 transition-colors"
        >
          Passer →
        </button>
      </div>
    </div>
  )
}
