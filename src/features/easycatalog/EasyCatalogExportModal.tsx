import { useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import { toast } from 'sonner'
import { CloseButton } from '@/components/shared/CloseButton'
import type { ExcelSheet } from '@/features/excel/types'
import { buildEcFieldNames } from './ecFieldName'
import { buildFieldDescriptors, resolveKeyInfo } from './ecExport'
import { useEasyCatalogExport } from './useEasyCatalogExport'
import type { EcFormat } from './ecZip'
import { t } from '@/lib/i18n'

interface Props {
  open: boolean
  onClose: () => void
  sheet: ExcelSheet | null
  sourceName: string
}

const FORMATS: { id: EcFormat; label: string }[] = [
  { id: 'csv-tab', label: 'CSV (tabulation)' },
  { id: 'csv-comma', label: 'CSV (virgule)' },
  { id: 'xlsx', label: 'Excel (.xlsx)' },
]

export function EasyCatalogExportModal({ open, onClose, sheet, sourceName }: Props) {
  const [format, setFormat] = useState<EcFormat>('csv-tab')
  const [busy, setBusy] = useState(false)
  const { exportSheet } = useEasyCatalogExport()

  const { descriptors, keyName } = useMemo(() => {
    if (!sheet) return { descriptors: [], keyName: '' }
    const ecNames = buildEcFieldNames(sheet.columns)
    const keyInfo = resolveKeyInfo(sheet, ecNames)
    return { descriptors: buildFieldDescriptors(sheet, ecNames, keyInfo), keyName: keyInfo.keyName }
  }, [sheet])

  if (!open) return null

  const handleExport = async () => {
    if (!sheet) return
    setBusy(true)
    try {
      await exportSheet(sheet, sourceName, { format })
      onClose()
    } catch (err) {
      console.error('EasyCatalog export failed', err)
      toast.error(t('tst.ec.exportFailed', { message: err instanceof Error ? err.message : t('tst.unknownError') }))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-surface border border-white/10 rounded-xl w-[420px] max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <h2 className="text-sm font-medium text-white/90">Exporter pour EasyCatalog</h2>
          <CloseButton onClick={onClose} />
        </div>

        <div className="p-5 space-y-4">
          <div>
            <div className="text-[11px] uppercase text-white/40 mb-1.5">Format</div>
            <div className="flex gap-2">
              {FORMATS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFormat(f.id)}
                  className={`px-3 py-1.5 rounded text-sm border ${
                    format === f.id
                      ? 'bg-accent border-accent text-white'
                      : 'border-white/10 text-white/60 hover:border-white/30'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="text-[11px] uppercase text-white/40 mb-1.5">
              Champ-clé : <span className="text-accent">{keyName}</span>
            </div>
            <div className="max-h-52 overflow-auto rounded border border-white/10 divide-y divide-white/10">
              {descriptors.map((d) => (
                <div key={d.ecFieldName} className="flex items-center justify-between px-3 py-1.5 text-sm">
                  <span className="text-white/80">{d.ecFieldName}</span>
                  <span className="text-xs text-white/40">
                    {d.ecType}
                    {d.isKey ? ' · clé' : ''}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={handleExport}
            disabled={busy || !sheet}
            className="w-full flex items-center justify-center gap-2 bg-accent hover:bg-[#5457e5] disabled:opacity-40 text-white rounded py-2 text-sm font-medium"
          >
            <Download className="w-4 h-4" />
            {busy ? 'Export…' : 'Télécharger le zip'}
          </button>
        </div>
      </div>
    </div>
  )
}
