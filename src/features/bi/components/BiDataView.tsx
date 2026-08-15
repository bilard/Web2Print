// Vue « Données » : les lignes du jeu de données, telles que le moteur les lit.
//
// ⚠⚠ Ce n'est pas un doublon du rapport : c'est ce qui permet de VÉRIFIER un chiffre. Un
// tableau de bord qu'on ne peut pas confronter à ses lignes se croit ou se rejette, il ne se
// vérifie pas — et c'est le premier reproche fait à un outil décisionnel.
//
// ⚠ Les filtres actifs s'appliquent ET sont affichés : montrer des lignes filtrées sans le
// dire ferait compter un extrait pour le tout.
import { Download } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'
import { BiRowsTable } from './BiRowsTable'
import { useTileDetail } from '../hooks/useTileDetail'
import type { FilterClause, SourceId } from '../types'

export function BiDataView({ sourceId, filters, name }: {
  /** Source à montrer : celle qui alimente le tableau. */
  sourceId: SourceId
  /** Filtres du tableau et du clic, appliqués comme sur les tuiles. */
  filters: FilterClause[]
  /** Nom du jeu de données, pour l'en-tête et le fichier exporté. */
  name: string
}) {
  const { t } = useTranslation()
  // ⚠ Le même hook que le tiroir d'une tuile : une seconde lecture « équivalente » finirait
  // par diverger, et l'on ne saurait plus laquelle des deux dit vrai.
  const { detail, filterLabels, exportRows } = useTileDetail(
    name,
    { source: sourceId, measures: [], dimensions: [], filters: [] },
    filters,
  )

  if (!detail) return null

  return (
    <section className="flex-1 min-h-0 flex flex-col bg-background">
      <header className="flex items-center gap-3 px-4 py-2.5 border-b border-white/[0.06] shrink-0">
        <div className="min-w-0">
          <h2 className="text-[13px] font-semibold text-white truncate">{name}</h2>
          <p className="text-[11px] text-white/45 tabular-nums">
            {detail.truncated
              ? t('bi.detail.count', { shown: detail.rows.length, total: detail.total })
              : t('bi.detail.total', { total: detail.total })}
          </p>
        </div>
        <span className="flex-1" />
        <button type="button" onClick={exportRows} disabled={detail.total === 0}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.06] bg-well px-2.5 py-1 text-[12px] text-white/70 hover:text-white disabled:opacity-40">
          <Download className="w-3.5 h-3.5" />{t('bi.detail.export')}
        </button>
      </header>

      {/* ⚠ Les filtres VOYAGENT avec les lignes : un extrait muet sur ses filtres se lit
          comme le tout. */}
      <div className="px-4 py-2 border-b border-white/[0.05] shrink-0 flex flex-wrap gap-1.5 items-center">
        <span className="text-[10px] uppercase tracking-wide text-white/35">{t('bi.detail.filters')}</span>
        {filterLabels.length === 0
          ? <span className="text-[11px] text-white/40">{t('bi.detail.noFilters')}</span>
          : filterLabels.map((f) => (
            <span key={f} className="text-[11px] px-2 py-0.5 rounded bg-white/[0.06] text-white/70">{f}</span>
          ))}
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        <BiRowsTable detail={detail} />
      </div>
    </section>
  )
}
