// Onglets de pages, en pied d'écran, et la barre d'état qui les accompagne.
//
// ⚠ Ajouter une page n'est offert qu'en ÉDITION et avec le droit d'écrire : le geste ÉCRIT
// dans Firestore, et un bouton qui déclenche un refus de règle échouerait en silence.
import { Plus } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'
import type { ReactNode } from 'react'
import type { DashboardPage } from '../types'

export function BiPageTabs({ pages, activeId, onSelect, onAdd, canAdd, status }: {
  pages: DashboardPage[]
  activeId: string
  onSelect: (id: string) => void
  onAdd: () => void
  /** Édition ET droit d'écrire — le bouton disparaît si l'un des deux manque. */
  canAdd: boolean
  /** `<BiStatusBar …>` : source, volume, fraîcheur. */
  status: ReactNode
}) {
  const { t } = useTranslation()
  return (
    <div
      role="tablist" aria-label={t('bi.page.tabs')}
      className="flex items-center gap-1 shrink-0 px-2.5 py-1.5 bg-surface border-t border-white/[0.06]"
    >
      {pages.map((p) => {
        const on = p.id === activeId
        return (
          <button
            key={p.id} type="button" role="tab" aria-selected={on}
            onClick={() => onSelect(p.id)}
            className={`px-2.5 py-1 rounded-t-md text-[11.5px] border-b-2 transition-colors max-w-[180px] truncate ${
              on
                ? 'text-white font-semibold border-indigo-500 bg-well'
                : 'text-white/45 border-transparent hover:text-white/75'
            }`}
          >
            {p.name}
          </button>
        )
      })}
      {canAdd && (
        <button
          type="button" onClick={onAdd} title={t('bi.page.add')} aria-label={t('bi.page.add')}
          className="ml-1 p-1 rounded-md bg-well text-white/45 hover:text-white transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      )}
      {status}
    </div>
  )
}
