import { useExcelStore } from '@/stores/excel.store'
import { useAdoptManufacturerSpec } from './useAdoptManufacturerSpec'
import { buildRowComparison, summarize } from './compareProducts'
import { ManufacturerVerdict } from './ManufacturerVerdict'
import type { FieldComparison, VerdictSummary } from './types'

interface Props {
  rowId: string
  sourceUrl: string | null
  sourceLabel: string
  mfrUrl: string | null
  mfrLabel: string
  eanMatch: boolean | null
  /** Repli tant que le recompute réactif depuis le store est indisponible. */
  fallbackComparisons: FieldComparison[]
  fallbackSummary: VerdictSummary
}

/** Verdict « done » avec adoption Src⇄Fab RÉACTIVE : la comparaison est recalculée
 *  depuis le store (colonnes ai_mfr_* + ai_mfr_alignment), donc le toggle se reflète
 *  immédiatement et persiste. Repli sur les valeurs du hook si le recompute est nul. */
export function VerdictDonePane({ rowId, sourceUrl, sourceLabel, mfrUrl, mfrLabel, eanMatch, fallbackComparisons, fallbackSummary }: Props) {
  const { setAdopted, busy } = useAdoptManufacturerSpec()
  const sheet = useExcelStore((s) => s.sheets[s.activeSheetIndex])
  const row = sheet?.rows.find((r) => r._id === rowId)
  const live = row && sheet ? buildRowComparison(row, sheet.columns) : null
  const comparisons = live ?? fallbackComparisons
  const summary = live ? summarize(live) : fallbackSummary

  return (
    <ManufacturerVerdict
      sourceUrl={sourceUrl}
      sourceLabel={sourceLabel}
      mfrUrl={mfrUrl}
      mfrLabel={mfrLabel}
      summary={summary}
      comparisons={comparisons}
      eanMatch={eanMatch}
      busy={busy}
      onToggleAdopt={(c, adopt) => {
        if (!c.mfrValue) return
        void setAdopted(rowId, { key: c.key, label: c.label, group: c.group, value: c.mfrValue }, adopt)
      }}
    />
  )
}
