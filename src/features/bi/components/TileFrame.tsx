// Cadre COMMUN à toutes les tuiles : titre, témoin de direct, âge de la donnée, états.
// ⚠ L'âge est affiché sur chaque tuile : un chiffre sans âge est invérifiable.
import { TileSkeleton, TileEmpty, TileError } from './TileStates'
import { useTranslation } from '@/lib/i18n'

interface Props {
  title: string
  /** Dernière donnée reçue (ms epoch), `null` si rien n'est encore arrivé. */
  updatedAt: number | null
  /** La tuile est branchée sur un flux, par opposition à une photo datée. */
  live: boolean
  state: 'loading' | 'empty' | 'error' | 'ready'
  skeleton: 'chart' | 'table' | 'kpi'
  error?: string
  onRetry: () => void
  onClearFilters: () => void
  children: React.ReactNode
}

function ageLabel(updatedAt: number | null): string {
  if (updatedAt == null) return '—'
  const s = Math.max(0, Math.round((Date.now() - updatedAt) / 1000))
  if (s < 60) return `${s} s`
  const m = Math.round(s / 60)
  return m < 60 ? `${m} min` : `${Math.round(m / 60)} h`
}

export function TileFrame({
  title, updatedAt, live, state, skeleton, error, onRetry, onClearFilters, children,
}: Props) {
  const { t } = useTranslation()
  return (
    <div className="h-full flex flex-col bg-surface rounded-lg border border-white/[0.06] overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/[0.05] shrink-0
        cursor-move bi-tile-handle">
        <h3 className="text-[12px] font-semibold text-white truncate flex-1">{title}</h3>
        {live && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />}
        <span className="text-[10px] tabular-nums text-white/35 shrink-0" title={t('bi.tile.ageTitle')}>
          {ageLabel(updatedAt)}
        </span>
      </div>
      {/* ⚠ `min-h-0` : sans lui, un enfant flex refuse de rétrécir et c'est la PAGE qui
          s'allonge. Le débordement scrolle DANS la tuile. */}
      <div className="flex-1 min-h-0 overflow-auto p-3">
        {state === 'loading' ? <TileSkeleton kind={skeleton} />
          : state === 'error' ? <TileError message={error ?? ''} onRetry={onRetry} />
          : state === 'empty' ? <TileEmpty onClearFilters={onClearFilters} />
          : children}
      </div>
    </div>
  )
}
