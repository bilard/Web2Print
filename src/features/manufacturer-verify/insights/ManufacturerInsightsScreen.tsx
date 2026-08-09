import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Factory, LayoutDashboard, Columns3, ListChecks, ScanSearch } from 'lucide-react'
import { useExcelStore } from '@/stores/excel.store'
import { useModuleIntent } from '@/features/navigation/useModuleIntent'
import { aggregateInsights, type ProductStat } from './insightsAggregate'
import { DatabaseList } from './DatabaseList'
import { InsightsKpiCards } from './InsightsKpiCards'
import { InsightsStatusDonut } from './InsightsStatusDonut'
import { InsightsDivergentBars } from './InsightsDivergentBars'
import { InsightsFieldTable } from './InsightsFieldTable'
import { InsightsProductTable } from './InsightsProductTable'
import { t } from '@/lib/i18n'

type Tab = 'overview' | 'fields' | 'products'

const TABS: { id: Tab; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'overview', label: "Vue d'ensemble", icon: LayoutDashboard },
  { id: 'fields', label: 'Par champ', icon: Columns3 },
  { id: 'products', label: 'Par produit', icon: ListChecks },
]

/** Écran de KPI/BI des écarts de données Source (revendeur) ⇄ Fabricant.
 *  Portée = document PIM actif (recompute déterministe, sans réseau). */
export function ManufacturerInsightsScreen() {
  const navigate = useNavigate()
  const sheets = useExcelStore((s) => s.sheets)
  const setActiveSheet = useExcelStore((s) => s.setActiveSheet)
  const setSheetRowId = useExcelStore((s) => s.setSheetRowId)
  const [tab, setTab] = useState<Tab>('overview')

  useModuleIntent('mfr-insights', (action) => {
    if (action.startsWith('tab:')) setTab(action.slice(4) as Tab)
  })

  const data = useMemo(() => aggregateInsights(sheets), [sheets])

  const openProduct = (p: ProductStat) => {
    setActiveSheet(p.sheetIndex)
    setSheetRowId(p.rowId)
    navigate('/dashboard', { state: { section: 'data' } })
  }

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Panneau gauche pleine hauteur (nav des bases), comme le menu global. */}
      <DatabaseList />

      {/* Zone droite scrollable : en-tête + statistiques. */}
      <main className="flex-1 min-w-0 overflow-auto p-8">
       <div className="max-w-6xl mx-auto">
        <header className="sticky top-0 z-30 -mx-8 px-8 pt-8 pb-4 mb-4 bg-background border-b border-white/[0.06] flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center shrink-0">
            <Factory className="w-5 h-5 text-indigo-300" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold">{t('mv.insights.title')}</h1>
            <p className="text-sm text-white/50">{t('mv.insights.subtitle')}</p>
          </div>
        </header>

        {data.verifiedCount === 0 ? (
          <div className="bg-surface border border-white/10 rounded-xl p-12 flex flex-col items-center text-center">
            <div className="w-14 h-14 rounded-2xl bg-white/[0.04] flex items-center justify-center mb-4">
              <ScanSearch className="w-7 h-7 text-white/40" />
            </div>
            <h2 className="text-lg font-semibold mb-1">{t('mv.insights.noVerified')}</h2>
            <p className="text-sm text-white/50 max-w-md mb-5">
              {t('mv.insights.pickDb')}
            </p>
            <button
              onClick={() => navigate('/dashboard', { state: { section: 'data' } })}
              className="px-4 py-2 rounded-lg bg-indigo-500/90 hover:bg-indigo-500 text-[#fff] text-sm font-medium"
            >
              {t('mv.insights.openPim')}
            </button>
          </div>
        ) : (
          <>
            <div className="flex gap-1 mb-5 border-b border-white/10">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                    tab === t.id
                      ? 'border-indigo-400 text-white'
                      : 'border-transparent text-white/50 hover:text-white/80'
                  }`}
                >
                  <t.icon className="w-4 h-4" />
                  {t.label}
                </button>
              ))}
            </div>

            {tab === 'overview' && (
              <div className="space-y-4">
                <InsightsKpiCards data={data} />
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
                  <InsightsStatusDonut title={t('mv.insights.globalDistribution')} counts={data.statusTotals} />
                  <InsightsDivergentBars fields={data.fields} />
                </div>
              </div>
            )}
            {tab === 'fields' && <InsightsFieldTable fields={data.fields} />}
            {tab === 'products' && <InsightsProductTable products={data.products} onOpenProduct={openProduct} />}
          </>
        )}
       </div>
      </main>
    </div>
  )
}
