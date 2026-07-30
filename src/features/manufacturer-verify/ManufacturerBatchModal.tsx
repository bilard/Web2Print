import { useMemo, useRef, useState } from 'react'
import { Factory, Loader2, Check, SkipForward, X, Ban } from 'lucide-react'
import { CloseButton } from '@/components/shared/CloseButton'
import { useExcelStore } from '@/stores/excel.store'
import type { EnrichedProduct } from '@/features/excel/ai-enrichment/types'
import { sheetRowToEnrichedProduct } from './compareProducts'
import { verifyRowAuto } from './runVerify'
import { useSaveManufacturerData } from './useSaveManufacturerData'
import { t } from '@/lib/i18n'

interface Props { onClose: () => void }

type RowStatus = 'pending' | 'running' | 'verified' | 'skipped' | 'blocked' | 'error'
interface Eligible { rowId: string; label: string; source: EnrichedProduct }

const ICON: Record<RowStatus, React.ReactNode> = {
  pending: <span className="w-3.5 h-3.5 rounded-full border border-white/20" />,
  running: <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />,
  verified: <Check className="w-3.5 h-3.5 text-emerald-400" />,
  skipped: <SkipForward className="w-3.5 h-3.5 text-amber-400" />,
  blocked: <Ban className="w-3.5 h-3.5 text-rose-400" />,
  error: <X className="w-3.5 h-3.5 text-rose-400" />,
}

/** Vérification fabricant EN LOT sur les produits scrapés de la feuille active. */
export function ManufacturerBatchModal({ onClose }: Props) {
  const { save } = useSaveManufacturerData()
  const [running, setRunning] = useState(false)
  const [status, setStatus] = useState<Record<string, { s: RowStatus; reason?: string }>>({})
  const abortRef = useRef(false)

  const eligible = useMemo<Eligible[]>(() => {
    const { sheets, activeSheetIndex } = useExcelStore.getState()
    const sheet = sheets[activeSheetIndex]
    if (!sheet) return []
    const out: Eligible[] = []
    for (const row of sheet.rows) {
      const source = sheetRowToEnrichedProduct(row, sheet.columns)
      if (source && (source.sourceUrl || source.brand || source.name)) {
        out.push({ rowId: row._id, label: source.name ?? row._id, source })
      }
    }
    return out
  }, [])

  const [selected, setSelected] = useState<Set<string>>(() => new Set(eligible.map((e) => e.rowId)))
  const toggle = (id: string) => setSelected((prev) => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n
  })

  const run = async () => {
    setRunning(true); abortRef.current = false
    for (const e of eligible) {
      if (abortRef.current) break
      if (!selected.has(e.rowId)) continue
      setStatus((p) => ({ ...p, [e.rowId]: { s: 'running' } }))
      try {
        const outcome = await verifyRowAuto(e.source)
        if (outcome.status === 'verified') {
          await save(e.rowId, outcome.result.mfr, { candidate: outcome.candidate, alignment: outcome.result.alignment })
          setStatus((p) => ({ ...p, [e.rowId]: { s: 'verified' } }))
        } else {
          setStatus((p) => ({ ...p, [e.rowId]: { s: outcome.status, reason: outcome.reason } }))
        }
      } catch (err) {
        setStatus((p) => ({ ...p, [e.rowId]: { s: 'error', reason: err instanceof Error ? err.message : 'erreur' } }))
      }
    }
    setRunning(false)
  }

  const done = Object.values(status).filter((v) => v.s !== 'pending' && v.s !== 'running').length
  const verified = Object.values(status).filter((v) => v.s === 'verified').length

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl border border-white/10 bg-background shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-white/[0.06] shrink-0">
          <div className="w-7 h-7 rounded-lg bg-indigo-500/15 border border-indigo-500/25 flex items-center justify-center">
            <Factory className="w-4 h-4 text-indigo-300" />
          </div>
          <div className="flex-1">
            <div className="text-[13px] font-semibold text-white">{t('mv.batch.title')}</div>
            <div className="text-[11px] text-white/40">{eligible.length} produit(s) scrapé(s) · {selected.size} sélectionné(s)</div>
          </div>
          <CloseButton onClick={onClose} size="sm" />
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {eligible.length === 0 ? (
            <p className="text-[13px] text-white/50 text-center py-12">{t('mv.batch.noScraped')}</p>
          ) : (
            <div className="flex flex-col gap-1">
              {eligible.map((e) => {
                const st = status[e.rowId]?.s ?? 'pending'
                return (
                  <label key={e.rowId} className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-white/[0.03] cursor-pointer">
                    <input type="checkbox" checked={selected.has(e.rowId)} disabled={running}
                      onChange={() => toggle(e.rowId)} className="accent-indigo-500 w-3.5 h-3.5" />
                    <span className="flex-1 text-[12px] text-white/70 truncate">{e.label}</span>
                    {status[e.rowId]?.reason && <span className="text-[10px] text-white/35 truncate max-w-[40%]">{status[e.rowId].reason}</span>}
                    {ICON[st]}
                  </label>
                )
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-t border-white/[0.06] shrink-0">
          <span className="text-[11px] text-white/40">
            {running ? `${done}/${selected.size} traités · ${verified} vérifiés`
              : done > 0 ? `Terminé : ${verified} vérifiés, ${done - verified} ignorés` : 'Seules les correspondances fortes sont fusionnées automatiquement.'}
          </span>
          {running ? (
            <button onClick={() => { abortRef.current = true }} className="px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-[12px] text-white/70 border border-white/10">
              Arrêter
            </button>
          ) : (
            <button onClick={() => void run()} disabled={selected.size === 0}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-indigo-500/90 hover:bg-indigo-500 disabled:opacity-40 text-[#fff] text-[12px] font-medium">
              <Factory className="w-3.5 h-3.5" /> Vérifier {selected.size} produit(s)
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
