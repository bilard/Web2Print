// Les états d'une tuile ne sont pas des trous : chacun dit ce qui se passe et ce qu'on peut
// faire. ⚠ Un tourniquet centré ne dit rien de la forme à venir — un squelette, si.
import { AlertTriangle, FilterX, RotateCcw } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'

export function TileSkeleton({ kind }: { kind: 'chart' | 'table' | 'kpi' }) {
  if (kind === 'kpi') return <div className="h-10 w-28 rounded bg-white/[0.06] animate-pulse" />
  if (kind === 'table') {
    return (
      <div className="space-y-1.5">
        {[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-4 rounded bg-white/[0.05] animate-pulse" />)}
      </div>
    )
  }
  return (
    <div className="flex items-end gap-1.5 h-full min-h-[6rem]">
      {[40, 70, 55, 85, 30, 60].map((h, i) => (
        <div key={i} className="flex-1 rounded-t bg-white/[0.06] animate-pulse" style={{ height: `${h}%` }} />
      ))}
    </div>
  )
}

/**
 * ⚠⚠ `message` : le hook sait POURQUOI le cadre est vide (« ouvrez une base dans le module
 * Données ») ; ce message était jeté et l'utilisateur sans feuille lisait « aucune donnée
 * pour ces filtres » — une explication fausse.
 * ⚠ `hasFilters` : « Retirer les filtres » ne retire que les filtres GLOBAUX. Proposé alors
 * qu'il n'y en a aucun, le bouton ne fait rien et laisse croire à une panne.
 */
export function TileEmpty({ message, hasFilters, onClearFilters }: {
  message?: string
  hasFilters: boolean
  onClearFilters: () => void
}) {
  const { t } = useTranslation()
  return (
    <div className="h-full flex flex-col items-center justify-center gap-2 text-center px-3">
      <p className="text-[11px] text-white/40 break-words">{message || t('bi.tile.empty')}</p>
      {hasFilters && (
        <button
          onClick={onClearFilters}
          className="inline-flex items-center gap-1.5 text-[11px] text-indigo-300 hover:text-indigo-200 transition-colors"
        >
          <FilterX className="w-3 h-3" />{t('bi.tile.clearFilters')}
        </button>
      )}
    </div>
  )
}

/**
 * Réserve affichée AU-DESSUS des chiffres, jamais à leur place.
 *
 * ⚠⚠ Un total incomplet est exploitable, un écran qui refuse tout ne l'est pas : « 87 412
 * fiches — relevé incomplet » fait travailler, « erreur » fait rouvrir l'ancien écran. La
 * règle « aucun chiffre faux en silence » tient dès lors que l'incomplétude est dite À CÔTÉ
 * du chiffre, en permanence — donc jamais dans un `title=` que personne ne survole.
 */
export function TileNotice({ text }: { text: string }) {
  return (
    <p className="flex items-start gap-1.5 mb-2 rounded bg-amber-400/10 border border-amber-400/25 px-2 py-1 text-[10px] leading-snug text-amber-200">
      <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0 mt-px" />
      {text}
    </p>
  )
}

export function TileError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="h-full flex flex-col items-center justify-center gap-2 text-center px-3">
      <AlertTriangle className="w-4 h-4 text-amber-400" />
      <p className="text-[11px] text-amber-200/80 break-words">{message}</p>
      <button
        onClick={onRetry}
        className="inline-flex items-center gap-1.5 text-[11px] text-white/60 hover:text-white transition-colors"
      >
        <RotateCcw className="w-3 h-3" />{t('bi.tile.retry')}
      </button>
    </div>
  )
}
