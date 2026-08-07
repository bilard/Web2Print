// Navigation catalogue (arborescence) à gauche du cockpit. Aujourd'hui un seul niveau
// existe dans le rapport : la FAMILLE. Structure prête pour Univers > Famille > Sous-
// famille dès que ces colonnes seront mappées à la source (cf. buildReport). Chaque
// nœud pilote le FILTRE global du cockpit (une seule source de vérité, pas un 2e chemin).
import type { Cockpit } from './analytics'
import { Layers } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'

export function CatalogTree({ ck, active, onSelect }: {
  ck: Cockpit
  active: string // filter.famille ('all' | famille)
  onSelect: (famille: string) => void
}) {
  const { t } = useTranslation()
  const fams = ck.allFamilies
  const total = fams.reduce((n, f) => n + f.count, 0)

  return (
    <aside className="bg-surface rounded-lg p-3 w-full">
      <div className="flex items-center gap-1.5 mb-2 px-1">
        <Layers className="w-3.5 h-3.5 text-white/40" />
        <span className="text-xs font-semibold text-white/80">{t('pw.nav.title')}</span>
      </div>
      <div className="text-[10px] text-white/30 px-1 mb-2">{t('pw.nav.family', { count: fams.length })}</div>

      <button onClick={() => onSelect('all')}
        className={`w-full flex items-center justify-between text-left rounded px-2 py-1.5 text-xs select-none focus:outline-none focus-visible:ring-1 focus-visible:ring-indigo-400/50 ${active === 'all' ? 'bg-indigo-500/15 text-white' : 'text-white/70 hover:bg-white/[0.04]'}`}>
        <span>{t('pw.nav.all')}</span>
        <span className="text-white/35 tabular-nums">{total}</span>
      </button>

      {/* 620 px : à 300, dix familles sur cinquante étaient visibles et la navigation se
          faisait à la molette dans une fenêtre haute comme quatre lignes de KPI. */}
      <div className="mt-1 max-h-[620px] overflow-y-auto overscroll-contain space-y-0.5 pr-0.5">
        {fams.map((f) => {
          const on = active === f.famille
          return (
            <button key={f.famille} onClick={() => onSelect(f.famille)}
              className={`w-full flex items-center justify-between text-left rounded pl-4 pr-2 py-1.5 text-xs select-none focus:outline-none focus-visible:ring-1 focus-visible:ring-indigo-400/50 ${on ? 'bg-indigo-500/15 text-white' : 'text-white/70 hover:bg-white/[0.04]'}`}>
              <span className="truncate" title={f.famille}>{f.famille}</span>
              <span className="flex items-center gap-1.5 shrink-0">
                {f.undercut > 0 && <span className="w-1.5 h-1.5 rounded-full bg-rose-400/80" title={t('pw.tail.familyUndercut', { count: f.undercut })} />}
                <span className="text-white/35 tabular-nums">{f.count}</span>
              </span>
            </button>
          )
        })}
      </div>
    </aside>
  )
}
